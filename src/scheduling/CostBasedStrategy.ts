import { Direction } from "../domain/Direction.js";
import { ElevatorSnapshot } from "../domain/Elevator.js";
import { Request } from "../domain/Request.js";
import { RequestType } from "../domain/RequestType.js";
import { ElevatorDispatchStrategy } from "./ElevatorDispatchStrategy.js";

/**
 * Picks the elevator with lowest score = ETA + pendingStops × WORKLOAD_WEIGHT.
 * ETA is distance if en route and compatible, otherwise distance via turnaround.
 * Tie-break: lower elevator id.
 */
export class CostBasedStrategy implements ElevatorDispatchStrategy {
  /** Fractional workload cost per pending stop. */
  static readonly WORKLOAD_WEIGHT = 0.1;

  select(elevators: ReadonlyArray<ElevatorSnapshot>, request: Request): number | null {
    if (elevators.length === 0) return null;

    let bestId: number | null = null;
    let bestScore = Infinity;

    for (const snap of elevators) {
      const score = this._score(snap, request);
      // Strict < keeps the first elevator found as the tie-winner.
      // Elevators are stored in id order, so lowest id wins ties.
      if (score < bestScore) {
        bestScore = score;
        bestId = snap.id;
      }
    }

    return bestId;
  }

  private _score(snap: ElevatorSnapshot, request: Request): number {
    return (
      this._eta(snap, request) +
      snap.pendingFloors.length * CostBasedStrategy.WORKLOAD_WEIGHT
    );
  }

  private _eta(snap: ElevatorSnapshot, request: Request): number {
    const cur = snap.currentFloor;
    const reqFloor = request.floor;

    if (snap.direction === Direction.Idle) {
      return Math.abs(cur - reqFloor);
    }

    const wantedDir = this._wantedDirection(request.type);

    // Elevator is moving toward the request floor (or already there).
    const movingToward =
      (snap.direction === Direction.Up   && reqFloor >= cur) ||
      (snap.direction === Direction.Down && reqFloor <= cur);

    // Current direction is compatible with the request type.
    const compatible = wantedDir === null || snap.direction === wantedDir;

    if (movingToward && compatible) {
      return Math.abs(cur - reqFloor);
    }

    // Must finish current run then reverse.
    // Estimate: ticks to turnaround floor + ticks from turnaround to request.
    const turnaround = this._turnaroundFloor(snap);
    return Math.abs(cur - turnaround) + Math.abs(turnaround - reqFloor);
  }

  /**
   * Farthest pending floor in the elevator's current travel direction —
   * the point at which it will reverse.
   *
   * Assumes snapshot direction matches the presence of ahead stops (true
   * between ticks). Immediately after the last forward stop is served but
   * before _recalculateDirection flips to Down, Math.max/min may return a
   * floor behind the elevator — ETA is temporarily wrong but self-corrects
   * within one tick.
   */
  private _turnaroundFloor(snap: ElevatorSnapshot): number {
    const floors = snap.pendingFloors;
    if (floors.length === 0) return snap.currentFloor;
    return snap.direction === Direction.Up
      ? Math.max(...floors)
      : Math.min(...floors);
  }

  private _wantedDirection(type: RequestType): Direction | null {
    if (type === RequestType.PickupUp)   return Direction.Up;
    if (type === RequestType.PickupDown) return Direction.Down;
    return null; // Destination: no directional preference
  }
}
