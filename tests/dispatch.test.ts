import { describe, it, expect } from "vitest";
import { Elevator } from "../src/domain/Elevator.js";
import { RequestType } from "../src/domain/RequestType.js";
import { CostBasedStrategy } from "../src/scheduling/CostBasedStrategy.js";
import { NearestCarStrategy } from "../src/scheduling/NearestCarStrategy.js";

const strategy = new CostBasedStrategy();

function makeElevator(id: number, floor: number): Elevator {
  return new Elevator({ id, minFloor: 0, maxFloor: 20, initialFloor: floor });
}

function snaps(...elevators: Elevator[]) {
  return elevators.map(e => e.snapshot());
}

describe("CostBasedStrategy", () => {
  it("distributes sequential equal-distance requests — workload penalty prevents pile-on", () => {
    const e0 = makeElevator(0, 5);
    const e1 = makeElevator(1, 5);
    const e2 = makeElevator(2, 5);

    const req1 = { floor: 3, type: RequestType.PickupUp };
    const first = strategy.select(snaps(e0, e1, e2), req1)!;
    expect(first).toBe(0); // tie → lowest id wins

    // Simulate e0 receiving the stop so its workload increases
    e0.addStop(3, RequestType.PickupUp);

    const req2 = { floor: 3, type: RequestType.PickupDown };
    const second = strategy.select(snaps(e0, e1, e2), req2)!;
    // e0 pendingFloors.length=1 → score 0+0.1; e1 score 0 → e1 wins
    expect(second).toBe(1);
  });

  it("penalizes busy elevator vs idle elevator at equal distance", () => {
    const busy = makeElevator(0, 5);
    busy.addStop(8, RequestType.Destination);
    busy.addStop(10, RequestType.Destination);
    busy.addStop(12, RequestType.Destination);

    const idle = makeElevator(1, 5);

    const req = { floor: 7, type: RequestType.PickupUp };
    const winner = strategy.select(snaps(busy, idle), req)!;
    expect(winner).toBe(1); // idle wins despite same ETA (workload penalty on busy)
  });

  it("prefers en-route compatible elevator over farther idle elevator", () => {
    // e0 is at floor 2, moving Up, has a stop at 8 — request is pickup-up at floor 5
    const enRoute = makeElevator(0, 2);
    enRoute.addStop(8, RequestType.Destination);
    enRoute.tick(); // floor 2→3, direction=Up

    // e1 is idle at floor 0
    const farIdle = makeElevator(1, 0);

    const req = { floor: 5, type: RequestType.PickupUp };
    const winner = strategy.select(snaps(enRoute, farIdle), req)!;

    // enRoute at floor 3 moving up → ETA = abs(3-5) = 2; farIdle at 0 → ETA = 5
    expect(winner).toBe(0);
  });

  it("penalizes wrong-direction pickup vs idle elevator", () => {
    // e0 is at floor 8, moving Down, pending stop at floor 2 — turnaround=2
    const wrongDir = makeElevator(0, 8);
    wrongDir.addStop(2, RequestType.Destination);
    wrongDir.tick(); // floor 8→7, direction=Down

    // e1 is idle at floor 6 — ETA for floor 9 pickup-up = abs(6-9) = 3
    const idleNear = makeElevator(1, 6);

    const req = { floor: 9, type: RequestType.PickupUp };

    // wrongDir at 7, going Down, turnaround=2
    // ETA = abs(7-2) + abs(2-9) = 5 + 7 = 12
    // idleNear ETA = abs(6-9) = 3
    const winner = strategy.select(snaps(wrongDir, idleNear), req)!;
    expect(winner).toBe(1);
  });
});

describe("NearestCarStrategy", () => {
  const nearest = new NearestCarStrategy();

  it("picks the closest elevator by floor distance", () => {
    const e0 = makeElevator(0, 2);
    const e1 = makeElevator(1, 8);
    const req = { floor: 7, type: RequestType.PickupUp };
    expect(nearest.select(snaps(e0, e1), req)).toBe(1);
  });

  it("ties go to the lowest elevator id", () => {
    const e0 = makeElevator(0, 3);
    const e1 = makeElevator(1, 7);
    const req = { floor: 5, type: RequestType.PickupUp }; // equidistant
    expect(nearest.select(snaps(e0, e1), req)).toBe(0);
  });

  it("ignores direction and workload — picks closest even when busy", () => {
    const busy = makeElevator(0, 5);
    busy.addStop(1, RequestType.Destination);
    busy.addStop(2, RequestType.Destination);
    busy.addStop(3, RequestType.Destination);

    const idle = makeElevator(1, 10);
    const req = { floor: 6, type: RequestType.PickupDown };
    // busy at floor 5 is closer (dist 1) than idle at floor 10 (dist 4)
    expect(nearest.select(snaps(busy, idle), req)).toBe(0);
  });

  it("returns null with no elevators", () => {
    expect(nearest.select([], { floor: 3, type: RequestType.PickupUp })).toBeNull();
  });
});
