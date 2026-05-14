/**
 * Demonstrates a 3-elevator, 10-floor building simulation.
 * Run with: npm run example
 */

import { ElevatorController, RequestType } from "../src/index.js";

const ctrl = new ElevatorController({ elevatorCount: 3, minFloor: 0, maxFloor: 9 });

console.log("=== Elevator Control System — Basic Simulation ===\n");

// Hall calls: submitted at the building level, dispatched to the best elevator.
const hallCalls: Array<{ floor: number; type: RequestType.PickupUp | RequestType.PickupDown }> = [
  { floor: 7, type: RequestType.PickupUp },
  { floor: 3, type: RequestType.PickupDown },
  { floor: 0, type: RequestType.PickupUp },
];

for (const req of hallCalls) {
  const elevatorId = ctrl.requestHallCall(req);
  console.log(
    `Hall call [${req.type}] floor ${req.floor} → assigned to elevator ${elevatorId ?? "(no-op)"}`
  );
}

// In-cabin destination: passenger already in elevator 0 presses floor 5.
ctrl.requestDestination(0, 5);
console.log("In-cabin destination: elevator 0 → floor 5");

console.log("\n--- Simulation ticks ---");

const results = ctrl.runToIdle();

for (const result of results) {
  const arrivals = [...result.arrivals.entries()]
    .map(([id, floor]) => `E${id}→floor ${floor}`)
    .join(", ");

  const states = result.elevators
    .map((e) => `E${e.id}[floor ${e.currentFloor} ${e.direction}]`)
    .join("  ");

  console.log(`Tick ${result.tick}: ${states}${arrivals ? `  ARRIVED: ${arrivals}` : ""}`);
}

console.log("\n=== All elevators idle. Simulation complete. ===");

// Scenario 2: passenger journey
console.log("\n=== Scenario 2: Passenger journey ===\n");

const ctrl2 = new ElevatorController({ elevatorCount: 1, minFloor: 0, maxFloor: 9 });

ctrl2.requestHallCall({ floor: 3, type: RequestType.PickupUp });
console.log("Hall call: PickupUp at floor 3");

let pickedUp = false;
let tick = 0;

while (true) {
  const snap = ctrl2.getElevatorSnapshot(0);
  if (!snap.pendingFloors.length && snap.currentFloor === 8) break;
  if (tick > 30) break; // safety

  const result = ctrl2.step();
  tick++;

  if (result.arrivals.get(0) === 3 && !pickedUp) {
    pickedUp = true;
    ctrl2.requestDestination(0, 8);
    console.log(`Tick ${tick}: Elevator arrived at floor 3. Passenger boards, presses floor 8.`);
  } else {
    const s = ctrl2.getElevatorSnapshot(0);
    console.log(`Tick ${tick}: Elevator at floor ${s.currentFloor} (${s.direction})`);
  }
}

console.log(`\nPassenger delivered to floor ${ctrl2.getElevatorSnapshot(0).currentFloor}.`);
