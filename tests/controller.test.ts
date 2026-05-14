import { describe, it, expect } from "vitest";
import { ElevatorController } from "../src/ElevatorController.js";
import { RequestType } from "../src/domain/RequestType.js";
import type { ElevatorSnapshot } from "../src/domain/Elevator.js";
import type { ElevatorDispatchStrategy } from "../src/scheduling/ElevatorDispatchStrategy.js";
import type { Request } from "../src/domain/Request.js";

// Validation

describe("ElevatorController — invalid requests", () => {
  const ctrl = new ElevatorController();

  it("throws on floor below minFloor", () => {
    expect(() => ctrl.requestDestination(0, -1)).toThrow("out of range");
  });

  it("throws on floor above maxFloor", () => {
    expect(() => ctrl.requestDestination(0, 10)).toThrow("out of range");
  });

  it("throws on non-integer floor", () => {
    expect(() => ctrl.requestDestination(0, 1.5)).toThrow("integer");
  });

  it("requestHallCall() rejects Destination — must use requestDestination()", () => {
    expect(() =>
      ctrl.requestHallCall({ floor: 3, type: "DESTINATION" as unknown as RequestType.PickupUp })
    ).toThrow("hall calls");
  });

  it("requestHallCall() rejects unknown type at runtime", () => {
    expect(() =>
      ctrl.requestHallCall({ floor: 3, type: "TELEPORT" as unknown as RequestType.PickupUp })
    ).toThrow("hall calls");
  });

  it("throws on invalid config", () => {
    expect(() => new ElevatorController({ elevatorCount: 0 })).toThrow();
    expect(() => new ElevatorController({ minFloor: 5, maxFloor: 3 })).toThrow();
  });

  it("throws when initialFloors has more entries than elevatorCount", () => {
    expect(() =>
      new ElevatorController({ elevatorCount: 2, initialFloors: [0, 1, 2] })
    ).toThrow("elevatorCount");
  });

  it("throws when an initialFloor entry is out of range", () => {
    expect(() =>
      new ElevatorController({ minFloor: 0, maxFloor: 9, initialFloors: [5, 99] })
    ).toThrow("out of range");
  });
});

// Hall call deduplication

describe("ElevatorController — hall call deduplication", () => {
  it("second identical PickupUp returns null (already queued)", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });
    const id1 = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    const id2 = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    expect(id1).not.toBeNull();
    expect(id2).toBeNull();
  });

  it("second identical PickupDown returns null", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });
    ctrl.requestHallCall({ floor: 5, type: RequestType.PickupDown });
    expect(ctrl.requestHallCall({ floor: 5, type: RequestType.PickupDown })).toBeNull();
  });

  it("same floor, different direction types are independent hall calls", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });
    const upId = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    const dnId = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupDown });
    expect(upId).not.toBeNull();
    expect(dnId).not.toBeNull();
  });

  it("duplicate hall call not assigned to a second elevator", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });
    ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp }); // ignored

    // Only one elevator has the stop
    const withStop = ctrl.snapshot().filter((s) =>
      s.pendingFloors.includes(5)
    );
    expect(withStop).toHaveLength(1);
  });

  it("hall call becomes re-requestable after being served", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestHallCall({ floor: 3, type: RequestType.PickupUp });
    ctrl.runToIdle(); // elevator travels to floor 3 and serves it

    // Now the hall call should be re-submittable
    const id = ctrl.requestHallCall({ floor: 3, type: RequestType.PickupUp });
    expect(id).not.toBeNull();
  });
});

// Destination deduplication

describe("ElevatorController — destination deduplication", () => {
  it("returns false for duplicate destination on same elevator", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestDestination(0, 5);
    expect(ctrl.requestDestination(0, 5)).toBe(false);
  });
});

// Basic dispatch

describe("ElevatorController — basic dispatch", () => {
  it("assigns request and returns elevator id", () => {
    const ctrl = new ElevatorController();
    const id = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    expect(id).not.toBeNull();
    expect(id).toBeGreaterThanOrEqual(0);
  });

  it("elevator reaches target floor after enough ticks", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestDestination(0, 4);
    const results = ctrl.runToIdle();
    const arrivals = results.flatMap((r) => [...r.arrivals.values()]);
    expect(arrivals).toContain(4);
    expect(ctrl.getElevatorSnapshot(0).currentFloor).toBe(4);
  });

  it("same-floor Destination is served on the next tick without moving", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1, initialFloors: [5] });
    ctrl.requestDestination(0, 5);

    const result = ctrl.step();
    expect(result.arrivals.get(0)).toBe(5);
    expect(ctrl.getElevatorSnapshot(0).currentFloor).toBe(5); // no movement
    expect(ctrl.getElevatorSnapshot(0).pendingFloors).toHaveLength(0);
  });

  it("hall call at current floor of idle elevator is queued and served in next tick", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    const id = ctrl.requestHallCall({ floor: 0, type: RequestType.PickupUp });
    expect(id).toBe(0); // assigned, not null

    const result = ctrl.step();
    // Elevator was already at floor 0 — tick() serves it before moving
    expect(result.arrivals.get(0)).toBe(0);
  });

  it("requestDestination adds in-cabin stop and returns true", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    expect(ctrl.requestDestination(0, 5)).toBe(true);
    expect(ctrl.getElevatorSnapshot(0).pendingFloors).toContain(5);
  });

  it("requestDestination returns false for duplicate", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestDestination(0, 5);
    expect(ctrl.requestDestination(0, 5)).toBe(false);
  });

  it("requestDestination throws on invalid floor", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    expect(() => ctrl.requestDestination(0, 99)).toThrow("out of range");
  });

  it("requestDestination throws on invalid elevator id", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    expect(() => ctrl.requestDestination(5, 3)).toThrow("No elevator");
  });
});

// Direction-aware dispatch

describe("ElevatorController — direction-aware dispatch", () => {
  it("prefers elevator already heading the right way for PickupUp", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });

    ctrl.requestDestination(0, 8); // elevator 0 starts up
    ctrl.step(); // tick 1: elevator 0 at floor 1
    ctrl.step(); // tick 2: elevator 0 at floor 2

    const assignedId = ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    expect(assignedId).toBe(0); // en-route upward elevator wins
  });

  it("PickupDown not assigned to elevator heading up when idle alternative exists", () => {
    const ctrl = new ElevatorController({ elevatorCount: 2 });
    ctrl.requestDestination(0, 8); // elevator 0 goes up
    ctrl.step();
    ctrl.step(); // elevator 0 at floor 2, heading up

    const assignedId = ctrl.requestHallCall({ floor: 3, type: RequestType.PickupDown });
    expect(assignedId).toBe(1); // elevator 1 is idle — better match for PickupDown
  });

  it("PickupDown at a floor is not served while elevator passes it going up", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestDestination(0, 7);
    ctrl.requestHallCall({ floor: 3, type: RequestType.PickupDown });

    const results = ctrl.runToIdle();

    // Floor 7 must be served BEFORE floor 3
    const floor7Tick = results.findIndex((r) => r.arrivals.get(0) === 7);
    const floor3Tick = results.findIndex((r) => r.arrivals.get(0) === 3);
    expect(floor7Tick).toBeGreaterThan(-1);
    expect(floor3Tick).toBeGreaterThan(floor7Tick); // 3 served after 7
  });
});

// Multi-elevator

describe("ElevatorController — multi-elevator", () => {
  it("runs multiple elevators to idle independently", () => {
    const ctrl = new ElevatorController({ elevatorCount: 3 });
    ctrl.requestDestination(0, 2);
    ctrl.requestDestination(1, 7);

    const results = ctrl.runToIdle();
    const arrivals = results.flatMap((r) => [...r.arrivals.values()]);
    expect(arrivals).toContain(2);
    expect(arrivals).toContain(7);
  });
});

// Configurable building

describe("ElevatorController — configurable building", () => {
  it("respects custom floor range", () => {
    const ctrl = new ElevatorController({ minFloor: 1, maxFloor: 5 });
    expect(() => ctrl.requestDestination(0, 0)).toThrow();
    expect(() => ctrl.requestDestination(0, 6)).toThrow();
    expect(() => ctrl.requestDestination(0, 3)).not.toThrow();
  });
});

// step() / tick API

describe("ElevatorController — step returns state", () => {
  it("step returns tick count, arrivals map, and snapshots", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestDestination(0, 2);

    const r1 = ctrl.step();
    expect(r1.tick).toBe(1);
    expect(r1.elevators).toHaveLength(1);

    const r2 = ctrl.step(); // arrives at floor 2
    expect(r2.tick).toBe(2);
    expect(r2.arrivals.get(0)).toBe(2);
  });

  it("strategy receives read-only snapshots, not live Elevator objects", () => {
    let received: ReadonlyArray<ElevatorSnapshot> | undefined;
    const spy: ElevatorDispatchStrategy = {
      select(elevators: ReadonlyArray<ElevatorSnapshot>, _req: Request): number | null {
        received = elevators;
        return 0;
      },
    };
    const ctrl = new ElevatorController({ elevatorCount: 2, strategy: spy });
    ctrl.requestHallCall({ floor: 3, type: RequestType.PickupUp });

    expect(received).toHaveLength(2);
    // Snapshots are plain data — mutation methods from the live Elevator must not be present.
    expect((received![0] as unknown as Record<string, unknown>)["addStop"]).toBeUndefined();
    expect((received![0] as unknown as Record<string, unknown>)["tick"]).toBeUndefined();
    expect(typeof received![0]!.currentFloor).toBe("number");
  });

  it("currentTick increments with each step", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    expect(ctrl.currentTick).toBe(0);
    ctrl.step();
    expect(ctrl.currentTick).toBe(1);
    ctrl.step();
    expect(ctrl.currentTick).toBe(2);
  });
});

// hasPendingHallCall

describe("ElevatorController — hasPendingHallCall", () => {
  it("reflects queued and served state", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    expect(ctrl.hasPendingHallCall(3, RequestType.PickupUp)).toBe(false);
    ctrl.requestHallCall({ floor: 3, type: RequestType.PickupUp });
    expect(ctrl.hasPendingHallCall(3, RequestType.PickupUp)).toBe(true);
    ctrl.runToIdle();
    expect(ctrl.hasPendingHallCall(3, RequestType.PickupUp)).toBe(false);
  });

  it("independent per direction", () => {
    const ctrl = new ElevatorController({ elevatorCount: 1 });
    ctrl.requestHallCall({ floor: 5, type: RequestType.PickupUp });
    expect(ctrl.hasPendingHallCall(5, RequestType.PickupDown)).toBe(false);
    expect(ctrl.hasPendingHallCall(5, RequestType.PickupUp)).toBe(true);
  });
});
