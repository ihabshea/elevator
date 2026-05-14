import { ElevatorSnapshot } from "../domain/Elevator.js";
import { Request } from "../domain/Request.js";

export interface ElevatorDispatchStrategy {
  /**
   * Select the best elevator to handle a hall call.
   *
   * Receives read-only snapshots — the strategy cannot mutate live elevator
   * state. Returns the chosen elevator's id, or null if no elevator is
   * available (should not happen in a correctly configured building).
   */
  select(elevators: ReadonlyArray<ElevatorSnapshot>, request: Request): number | null;
}
