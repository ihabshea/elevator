export enum RequestType {
  /** Hall call: passenger wants to go up from this floor */
  PickupUp = "PICKUP_UP",
  /** Hall call: passenger wants to go down from this floor */
  PickupDown = "PICKUP_DOWN",
  /** In-cabin button: go to this floor */
  Destination = "DESTINATION",
}
