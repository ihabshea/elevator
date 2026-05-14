import { Direction } from "./Direction.js";
import { RequestType } from "./RequestType.js";

export interface ElevatorConfig {
  readonly id: number;
  readonly minFloor: number;
  readonly maxFloor: number;
  /** Starting floor. Defaults to minFloor. */
  readonly initialFloor?: number;
}

export class Elevator {
  readonly id: number;
  readonly minFloor: number;
  readonly maxFloor: number;

  private _currentFloor: number;
  private _direction: Direction;

  /** Pending stops: floor → set of request types still to serve there. */
  private readonly stops: Map<number, Set<RequestType>>;

  constructor(config: ElevatorConfig) {
    this.id = config.id;
    this.minFloor = config.minFloor;
    this.maxFloor = config.maxFloor;
    this._currentFloor = config.initialFloor ?? config.minFloor;
    this._direction = Direction.Idle;
    this.stops = new Map();
  }

  get currentFloor(): number {
    return this._currentFloor;
  }

  get direction(): Direction {
    return this._direction;
  }

  /** Add a stop. Returns false if already pending (dedup). Throws on invalid input. */
  addStop(floor: number, type: RequestType): boolean {
    if (!Number.isInteger(floor) || floor < this.minFloor || floor > this.maxFloor) {
      throw new Error(`Floor ${floor} out of range [${this.minFloor}, ${this.maxFloor}]`);
    }
    const validTypes = Object.values(RequestType) as string[];
    if (!validTypes.includes(type)) {
      throw new Error(`Unknown request type: ${type}`);
    }
    if (!this.stops.has(floor)) {
      this.stops.set(floor, new Set());
    }
    const types = this.stops.get(floor)!;
    if (types.has(type)) return false;
    types.add(type);
    return true;
  }

  /** True if (floor, type) is currently pending. */
  hasStop(floor: number, type: RequestType): boolean {
    return this.stops.get(floor)?.has(type) ?? false;
  }

  /** All floors with at least one pending stop. */
  get pendingFloors(): ReadonlySet<number> {
    return new Set(this.stops.keys());
  }

  /** True if any stops remain. */
  get hasPendingStops(): boolean {
    return this.stops.size > 0;
  }

  /**
   * Advance one tick (LOOK algorithm). Move one floor, serve compatible stops
   * at the current floor before and after moving, then re-evaluate direction.
   * Returns the floor served this tick, or null if still in transit.
   */
  tick(): number | null {
    if (!this.hasPendingStops) {
      this._direction = Direction.Idle;
      return null;
    }

    if (this._direction === Direction.Idle) {
      this._chooseInitialDirection();
    }

    // Serve any compatible stops at the current floor BEFORE moving.
    // This catches stops added to the current floor while the elevator is in transit.
    if (this._serveFloor(this._currentFloor)) {
      this._recalculateDirection();
      return this._currentFloor;
    }

    // Move one floor in current direction.
    if (this._direction === Direction.Up) {
      this._currentFloor++;
    } else if (this._direction === Direction.Down) {
      this._currentFloor--;
    }

    // Serve compatible stops at the new floor.
    if (this._serveFloor(this._currentFloor)) {
      this._recalculateDirection();
      return this._currentFloor;
    }

    // No stop served this tick — still recalculate so an elevator that has
    // passed its last serviceable stop in this direction reverses rather than
    // continuing past the building boundary.
    this._recalculateDirection();
    return null;
  }

  /** Snapshot for external consumption (logging, tests, UI). */
  snapshot(): ElevatorSnapshot {
    return {
      id: this.id,
      currentFloor: this._currentFloor,
      direction: this._direction,
      pendingFloors: [...this.pendingFloors].sort((a, b) => a - b),
    };
  }

  /**
   * Serve all direction-compatible request types at the given floor.
   * Removes served types; removes the floor entry if all types are served.
   * Returns true if at least one type was served.
   */
  private _serveFloor(floor: number): boolean {
    const types = this.stops.get(floor);
    if (!types) return false;

    const toRemove = [...types].filter((t) => this._isCompatible(t));
    if (toRemove.length === 0) return false;

    for (const t of toRemove) types.delete(t);
    if (types.size === 0) this.stops.delete(floor);

    return true;
  }

  /** A request type is compatible with the elevator's current direction. */
  private _isCompatible(type: RequestType): boolean {
    switch (type) {
      case RequestType.Destination:  return true;
      case RequestType.PickupUp:     return this._direction === Direction.Up;
      case RequestType.PickupDown:   return this._direction === Direction.Down;
    }
  }

  private _chooseInitialDirection(): void {
    const floors = [...this.stops.keys()];
    if (floors.length === 0) return;

    const above = floors.filter((f) => f > this._currentFloor);
    const below = floors.filter((f) => f < this._currentFloor);

    if (above.length > 0 && below.length === 0) {
      this._direction = Direction.Up;
    } else if (below.length > 0 && above.length === 0) {
      this._direction = Direction.Down;
    } else if (above.length > 0 && below.length > 0) {
      const nearestAbove = Math.min(...above);
      const nearestBelow = Math.max(...below);
      this._direction =
        nearestAbove - this._currentFloor <= this._currentFloor - nearestBelow
          ? Direction.Up
          : Direction.Down;
    } else {
      // All pending stops are at currentFloor. Choose direction by stop type so
      // the before-move serve in tick() can immediately handle them.
      const types = this.stops.get(this._currentFloor);
      if (types?.has(RequestType.PickupUp)) {
        this._direction = Direction.Up;
      } else if (types?.has(RequestType.PickupDown)) {
        this._direction = Direction.Down;
      }
      // Destination only: stay Idle — _serveFloor will handle it in place.
    }
  }

  private _recalculateDirection(): void {
    if (this._direction === Direction.Idle) return;
    const floors = [...this.stops.keys()];
    const ahead = this._direction === Direction.Up
      ? floors.filter((f) => f > this._currentFloor)
      : floors.filter((f) => f < this._currentFloor);

    if (ahead.length > 0) return; // continue in same direction

    const behind = this._direction === Direction.Up
      ? floors.filter((f) => f < this._currentFloor)
      : floors.filter((f) => f > this._currentFloor);

    if (behind.length > 0) {
      this._direction = this._direction === Direction.Up ? Direction.Down : Direction.Up;
    } else {
      // May still have stops at currentFloor (incompatible types).
      // They will be picked up on the next tick via _chooseInitialDirection.
      this._direction = Direction.Idle;
    }
  }
}

export interface ElevatorSnapshot {
  readonly id: number;
  readonly currentFloor: number;
  readonly direction: Direction;
  readonly pendingFloors: number[];
}
