import { RequestType } from "./RequestType.js";

/** A hall call — submitted at the building level, dispatched by the controller. */
export interface Request {
  readonly floor: number;
  readonly type: RequestType.PickupUp | RequestType.PickupDown;
}
