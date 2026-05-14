import { ElevatorSnapshot } from "../domain/Elevator.js";
import { Request } from "../domain/Request.js";
import { ElevatorDispatchStrategy } from "./ElevatorDispatchStrategy.js";

/**
 * Assigns the hall call to whichever elevator is closest by floor distance,
 * ignoring direction and workload. Useful as a baseline or in buildings where
 * all elevators are typically idle between calls.
 */
export class NearestCarStrategy implements ElevatorDispatchStrategy {
  select(elevators: ReadonlyArray<ElevatorSnapshot>, request: Request): number | null {
    if (elevators.length === 0) return null;

    let bestId: number | null = null;
    let bestDist = Infinity;

    for (const snap of elevators) {
      const dist = Math.abs(snap.currentFloor - request.floor);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = snap.id;
      }
    }

    return bestId;
  }
}
