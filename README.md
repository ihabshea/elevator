# elevator

TypeScript elevator control system — LOOK scheduling, cost-based dispatch, Vite simulation frontend.

## Quick start

```bash
npm install
npm test          # run all tests
npm run dev       # frontend simulation at http://localhost:5173
npm run example   # CLI walkthrough
```

## Architecture

```
src/
  domain/
    Direction.ts          — Up / Down / Idle enum
    RequestType.ts        — PickupUp / PickupDown / Destination enum
    Request.ts            — { floor, type } interface
    Elevator.ts           — single elevator state machine (LOOK algorithm)
  scheduling/
    ElevatorDispatchStrategy.ts   — interface for plug-in strategies
    CostBasedStrategy.ts          — default: ETA + workload cost heuristic
    NearestCarStrategy.ts         — baseline: nearest car by floor distance
  ElevatorController.ts  — building-level coordinator; validates, dispatches, ticks
  index.ts               — public re-exports
tests/
  elevator.test.ts        — unit tests for Elevator
  controller.test.ts      — integration tests for ElevatorController
examples/
  basic-simulation.ts    — runnable walkthrough
sim/
  index.html / main.ts / style.css  — Vite frontend simulation
```

### Core model

**Elevator** is a state machine with:
- `currentFloor`, `direction` (read-only getters; Up / Down / Idle)
- A `Map<floor, Set<RequestType>>` of pending stops
- `tick()` advances one discrete time unit; the elevator moves one floor and may serve stops

**ElevatorController** is the building coordinator:
- Holds `N` elevators, validates all requests, delegates to a `DispatchStrategy`
- `requestHallCall(req)` — hall calls only (`PickupUp` / `PickupDown`); returns assigned elevator id or null (duplicate); throws if `Destination` is passed
- `requestDestination(elevatorId, floor)` — in-cabin button press for a specific elevator; returns true/false (duplicate); throws on invalid floor. If the elevator is already at `floor`, the stop is served on the next `tick()` without any movement.
- `hasPendingHallCall(floor, type)` — query whether a hall call is currently queued
- `step()` / `runToIdle()` drives the simulation

### LOOK algorithm (elevator movement)

Each `tick()`:
1. If idle, pick the direction toward the nearest stop (tie-break: closer wins).
2. Before moving, check whether the current floor has direction-compatible stops. If yes, serve them and return — no movement this tick.
3. Move one floor in current direction.
4. If the new floor has compatible stops, serve them and re-evaluate direction.
5. After serving: if stops remain ahead → continue. If stops exist behind → reverse. If none → idle.

**LOOK vs SCAN**: this is LOOK, not SCAN. SCAN would continue to the physical floor limit (min/max) before reversing. LOOK reverses at the last pending request in the current direction, which is more efficient.

**Direction-aware serving**: when an elevator arrives at a floor (or is already there), it only serves request types compatible with its current direction:
- `Destination` → served in either direction
- `PickupUp` → served only while moving Up (or starting upward from idle)
- `PickupDown` → served only while moving Down (or starting downward from idle)

Incompatible types remain pending until the elevator reverses and passes through that floor again.

### Dispatch strategy

Two strategies ship out of the box; swap via `BuildingConfig.strategy`:

- **`CostBasedStrategy`** (default) — scores each elevator as `ETA + pendingStops × 0.1`. ETA is the straight-line distance if an elevator is already heading toward the request in a compatible direction; otherwise it estimates the detour via the turnaround floor. The workload term keeps sequential equal-distance requests from piling onto one elevator. Tie-break: lower id.
- **`NearestCarStrategy`** — assigns purely by floor distance, ignoring direction and load. Useful as a baseline.

Both are local heuristics. Globally optimal multi-elevator scheduling is a combinatorial problem; the cost strategy trades exactness for O(N·S) per dispatch.

## Assumptions

- **Discrete time**: one tick = one floor of travel. Doors, boarding, and acceleration are not modeled.
- **No capacity limit**: an elevator serves all assigned stops regardless of load.
- **Hall calls are building-level**: `PickupUp` / `PickupDown` dispatched by the controller; `Destination` (in-cabin button) goes via `requestDestination(elevatorId, floor)`. The `Elevator` object is not exposed externally.

## Notes

`Map<floor, Set<RequestType>>` as the stop store lets the elevator serve one direction at a floor (removing compatible types) while leaving incompatible types pending — without needing two separate queues. `step()` and `Elevator.tick()` are both O(N·S) where N is elevator count and S is pending stop floors per elevator.
