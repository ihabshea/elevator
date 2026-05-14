import { describe, it, expect } from "vitest";
import { Elevator } from "../src/domain/Elevator.js";
import { Direction } from "../src/domain/Direction.js";
import { RequestType } from "../src/domain/RequestType.js";

function make(initialFloor = 0): Elevator {
  return new Elevator({ id: 0, minFloor: 0, maxFloor: 9, initialFloor });
}

// Idle behavior

describe("Elevator — idle behavior", () => {
  it("starts idle at initialFloor with no stops", () => {
    const e = make();
    expect(e.direction).toBe(Direction.Idle);
    expect(e.hasPendingStops).toBe(false);
    expect(e.currentFloor).toBe(0);
  });

  it("tick with no stops returns null and stays idle", () => {
    const e = make();
    expect(e.tick()).toBeNull();
    expect(e.direction).toBe(Direction.Idle);
    expect(e.currentFloor).toBe(0);
  });
});

// Basic movement

describe("Elevator — basic movement", () => {
  it("moves up toward a stop above", () => {
    const e = make();
    e.addStop(3, RequestType.Destination);

    e.tick(); // floor 1
    expect(e.currentFloor).toBe(1);
    expect(e.direction).toBe(Direction.Up);

    e.tick(); // floor 2
    e.tick(); // floor 3 — arrives
    expect(e.currentFloor).toBe(3);
    expect(e.hasPendingStops).toBe(false);
    expect(e.direction).toBe(Direction.Idle);
  });

  it("moves down toward a stop below", () => {
    const e = make(5);
    e.addStop(2, RequestType.Destination);

    e.tick(); // 4
    expect(e.direction).toBe(Direction.Down);
    e.tick(); // 3
    e.tick(); // 2 — arrives
    expect(e.currentFloor).toBe(2);
    expect(e.hasPendingStops).toBe(false);
  });

  it("stops at correct floor and returns the floor number", () => {
    const e = make();
    e.addStop(2, RequestType.Destination);

    const r1 = e.tick(); // floor 1
    expect(r1).toBeNull();
    const r2 = e.tick(); // floor 2
    expect(r2).toBe(2);
  });
});

// LOOK algorithm

describe("Elevator — LOOK algorithm", () => {
  it("sweeps up through all stops in order, then goes idle", () => {
    const e = make(); // floor 0
    e.addStop(3, RequestType.Destination);
    e.addStop(1, RequestType.Destination);
    e.addStop(5, RequestType.Destination);

    const stops: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = e.tick();
      if (r !== null) stops.push(r);
    }

    expect(stops).toEqual([1, 3, 5]);
    expect(e.hasPendingStops).toBe(false);
  });

  it("reverses at the last request in each direction (LOOK, not SCAN)", () => {
    const e = make(4);
    e.addStop(6, RequestType.Destination);
    e.addStop(2, RequestType.Destination);

    const stops: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = e.tick();
      if (r !== null) stops.push(r);
    }
    // Goes up to 6 (not to floor 9), reverses, comes down to 2 (not to floor 0)
    expect(stops).toEqual([6, 2]);
  });
});

// Deduplication

describe("Elevator — deduplication", () => {
  it("addStop returns false for exact duplicate", () => {
    const e = make();
    expect(e.addStop(3, RequestType.Destination)).toBe(true);
    expect(e.addStop(3, RequestType.Destination)).toBe(false);
    expect([...e.pendingFloors]).toEqual([3]);
  });

  it("same floor, different type counts as two separate entries", () => {
    const e = make();
    expect(e.addStop(3, RequestType.PickupUp)).toBe(true);
    expect(e.addStop(3, RequestType.Destination)).toBe(true);
  });

  it("hasStop reflects live pending state", () => {
    const e = make();
    e.addStop(3, RequestType.PickupUp);
    expect(e.hasStop(3, RequestType.PickupUp)).toBe(true);
    expect(e.hasStop(3, RequestType.PickupDown)).toBe(false);
  });
});

// Direction-aware serving

describe("Elevator — direction-aware serving", () => {
  it("serves PickupUp while moving up", () => {
    const e = make();
    e.addStop(5, RequestType.PickupUp);

    const stops: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = e.tick();
      if (r !== null) stops.push(r);
    }
    expect(stops).toContain(5);
    expect(e.hasPendingStops).toBe(false);
  });

  it("does NOT serve PickupDown while moving up — serves it on the return", () => {
    const e = make();
    // Floor 7 destination causes upward travel; floor 3 has a PickupDown
    e.addStop(7, RequestType.Destination);
    e.addStop(3, RequestType.PickupDown);

    const stops: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = e.tick();
      if (r !== null) stops.push(r);
    }

    // Floor 7 served going up, floor 3 served coming back down
    expect(stops).toEqual([7, 3]);
    expect(e.hasPendingStops).toBe(false);
    // PickupDown was NOT served on the way up (stops[0] is 7, not 3)
    expect(stops[0]).toBe(7);
  });

  it("does NOT serve PickupUp while moving down — serves it on the return", () => {
    const e = make(8);
    e.addStop(1, RequestType.Destination);
    e.addStop(5, RequestType.PickupUp);

    const stops: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = e.tick();
      if (r !== null) stops.push(r);
    }

    // Floor 1 served going down, floor 5 served on way back up
    expect(stops).toEqual([1, 5]);
  });

  it("PickupUp and PickupDown at the same floor are served in separate passes", () => {
    const e = make(3); // idle at floor 3
    e.addStop(3, RequestType.PickupUp);
    e.addStop(3, RequestType.PickupDown);

    // First tick: choose Up (for PickupUp), serve PickupUp at floor 3
    const r1 = e.tick();
    expect(r1).toBe(3);
    expect(e.hasStop(3, RequestType.PickupUp)).toBe(false);
    expect(e.hasStop(3, RequestType.PickupDown)).toBe(true); // still pending

    // Second tick: idle → choose Down (for PickupDown), serve PickupDown
    const r2 = e.tick();
    expect(r2).toBe(3);
    expect(e.hasPendingStops).toBe(false);
  });

  it("same-floor serviceable stop is served before any movement", () => {
    const e = make(3);
    // Give it a destination above so it starts moving up
    e.addStop(7, RequestType.Destination);
    e.tick(); // moves to 4
    e.tick(); // moves to 5

    // Inject a PickupUp at the current floor (5) while the elevator is in transit
    e.addStop(5, RequestType.PickupUp);

    // Next tick should serve floor 5 BEFORE moving to floor 6
    const stopped = e.tick();
    expect(stopped).toBe(5);
    expect(e.currentFloor).toBe(5); // did NOT advance to 6
  });

  it("incompatible stop at current floor does not prevent movement", () => {
    const e = make(3);
    e.addStop(7, RequestType.Destination);
    e.tick(); // 4
    e.tick(); // 5

    // Inject PickupDown at current floor (5) — incompatible while going Up
    e.addStop(5, RequestType.PickupDown);

    // Should still move up (not stop at 5)
    const stopped = e.tick();
    expect(stopped).toBeNull();
    expect(e.currentFloor).toBe(6);
    expect(e.hasStop(5, RequestType.PickupDown)).toBe(true); // still pending
  });
});
