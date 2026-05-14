import { Direction } from "./domain/Direction.js";
import { Elevator, ElevatorSnapshot } from "./domain/Elevator.js";
import { Request } from "./domain/Request.js";
import { RequestType } from "./domain/RequestType.js";
import { CostBasedStrategy } from "./scheduling/CostBasedStrategy.js";
import { ElevatorDispatchStrategy } from "./scheduling/ElevatorDispatchStrategy.js";

export interface BuildingConfig {
  /** Number of elevators. Default 3. */
  elevatorCount?: number;
  /** Lowest floor number (inclusive). Default 0. */
  minFloor?: number;
  /** Highest floor number (inclusive). Default 9. */
  maxFloor?: number;
  /**
   * Starting floor for each elevator by index.
   * Missing entries default to minFloor. Throws if any value is out of range.
   */
  initialFloors?: ReadonlyArray<number>;
  /** Custom dispatch strategy. Default CostBasedStrategy. */
  strategy?: ElevatorDispatchStrategy;
}

export interface TickResult {
  readonly tick: number;
  /** Elevator id → floor arrived at (only elevators that stopped this tick). */
  readonly arrivals: ReadonlyMap<number, number>;
  readonly elevators: ReadonlyArray<ElevatorSnapshot>;
}

export class ElevatorController {
  private readonly elevators: Elevator[];
  private readonly strategy: ElevatorDispatchStrategy;
  private readonly minFloor: number;
  private readonly maxFloor: number;
  private tickCount = 0;

  constructor(config: BuildingConfig = {}) {
    const elevatorCount = config.elevatorCount ?? 3;
    this.minFloor = config.minFloor ?? 0;
    this.maxFloor = config.maxFloor ?? 9;
    this.strategy = config.strategy ?? new CostBasedStrategy();

    if (elevatorCount < 1) throw new Error("elevatorCount must be >= 1");
    if (this.minFloor >= this.maxFloor)
      throw new Error("minFloor must be < maxFloor");

    const initialFloors = config.initialFloors ?? [];
    if (initialFloors.length > elevatorCount) {
      throw new Error(
        `initialFloors has ${initialFloors.length} entries but elevatorCount is ${elevatorCount}`
      );
    }
    for (let i = 0; i < initialFloors.length; i++) {
      const f = initialFloors[i]!;
      if (!Number.isInteger(f) || f < this.minFloor || f > this.maxFloor) {
        throw new Error(`initialFloors[${i}] = ${f} out of range [${this.minFloor}, ${this.maxFloor}]`);
      }
    }

    this.elevators = Array.from({ length: elevatorCount }, (_, i) =>
      new Elevator({
        id: i,
        minFloor: this.minFloor,
        maxFloor: this.maxFloor,
        initialFloor: initialFloors[i] ?? this.minFloor,
      })
    );
  }

  /** Dispatch a hall call. Returns assigned elevator id, or null if already queued. Throws on invalid input. */
  requestHallCall(req: Request): number | null {
    this._validateRequest(req);

    if (this.elevators.some((e) => e.hasStop(req.floor, req.type))) return null;

    const id = this.strategy.select(this.elevators.map((e) => e.snapshot()), req);
    if (id === null) throw new Error("No elevator available — this is a bug");

    const elevator = this.elevators[id];
    if (!elevator) throw new Error(`Strategy returned invalid id ${id} — this is a bug`);
    elevator.addStop(req.floor, req.type);
    return id;
  }

  step(): TickResult {
    this.tickCount++;
    const arrivals = new Map<number, number>();

    for (const elevator of this.elevators) {
      const stopped = elevator.tick();
      if (stopped !== null) {
        arrivals.set(elevator.id, stopped);
      }
    }

    return {
      tick: this.tickCount,
      arrivals,
      elevators: this.elevators.map((e) => e.snapshot()),
    };
  }

  /** Run until all elevators are idle with no pending stops. Returns all tick results. */
  runToIdle(): TickResult[] {
    const results: TickResult[] = [];
    while (this.elevators.some((e) => e.hasPendingStops || e.direction !== Direction.Idle)) {
      results.push(this.step());
    }
    return results;
  }

  get currentTick(): number {
    return this.tickCount;
  }

  /** Read-only snapshots of all elevators. */
  snapshot(): ReadonlyArray<ElevatorSnapshot> {
    return this.elevators.map((e) => e.snapshot());
  }

  /** In-cabin destination press. Returns true if added, false if duplicate. Throws on invalid input. */
  requestDestination(elevatorId: number, floor: number): boolean {
    this._validateFloor(floor);
    return this._getElevator(elevatorId).addStop(floor, RequestType.Destination);
  }

  /** True if any elevator currently has a pending hall call for this (floor, type). */
  hasPendingHallCall(floor: number, type: RequestType.PickupUp | RequestType.PickupDown): boolean {
    return this.elevators.some((e) => e.hasStop(floor, type));
  }

  /** Snapshot of a single elevator's state. */
  getElevatorSnapshot(id: number): ElevatorSnapshot {
    return this._getElevator(id).snapshot();
  }

  private _getElevator(id: number): Elevator {
    const elevator = this.elevators[id];
    if (!elevator) throw new Error(`No elevator with id ${id}`);
    return elevator;
  }

  private _validateRequest(req: Request): void {
    this._validateFloor(req.floor);
    // Runtime guard for JS callers passing invalid types.
    if (req.type !== RequestType.PickupUp && req.type !== RequestType.PickupDown) {
      const hint = req.type === RequestType.Destination
        ? " Use requestDestination() for in-cabin button presses."
        : "";
      throw new Error(`requestHallCall() only accepts hall calls (PickupUp/PickupDown).${hint}`);
    }
  }

  private _validateFloor(floor: number): void {
    if (!Number.isInteger(floor)) {
      throw new Error(`Invalid floor: ${floor} (must be an integer)`);
    }
    if (floor < this.minFloor || floor > this.maxFloor) {
      throw new Error(`Floor ${floor} out of range [${this.minFloor}, ${this.maxFloor}]`);
    }
  }
}
