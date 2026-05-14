import { ElevatorController, RequestType, Direction } from "../src/index.js";

const NUM_ELEVATORS = 3;
const MIN_FLOOR = 0;
const MAX_FLOOR = 9;
const FLOORS = Array.from({ length: MAX_FLOOR - MIN_FLOOR + 1 }, (_, i) => MAX_FLOOR - i);

let ctrl = makeController();
let playInterval: ReturnType<typeof setInterval> | null = null;

function makeController(): ElevatorController {
  return new ElevatorController({ elevatorCount: NUM_ELEVATORS, minFloor: MIN_FLOOR, maxFloor: MAX_FLOOR });
}

// Static DOM refs
const buildingEl   = document.getElementById("building")!;
const tickCountEl  = document.getElementById("tick-count")!;
const btnStep      = document.getElementById("btn-step")!;
const btnPlay      = document.getElementById("btn-play")!;
const btnReset     = document.getElementById("btn-reset")!;
const speedInput   = document.getElementById("speed") as HTMLInputElement;
const speedLabel   = document.getElementById("speed-label")!;
const hallFloorSel = document.getElementById("hall-floor") as HTMLSelectElement;
const destElSel    = document.getElementById("dest-elevator") as HTMLSelectElement;
const destFloorSel = document.getElementById("dest-floor") as HTMLSelectElement;
const btnPickupUp  = document.getElementById("btn-pickup-up")!;
const btnPickupDn  = document.getElementById("btn-pickup-down")!;
const btnDest      = document.getElementById("btn-destination")!;
const logEl        = document.getElementById("log")!;

// Cached grid element refs — populated once in buildGrid(), used on every render().
type ElevatorFloorKey = `${number}-${number}`;
const carEls     = new Map<ElevatorFloorKey, HTMLElement>();
const arrowEls   = new Map<ElevatorFloorKey, HTMLElement>();
const cellEls    = new Map<ElevatorFloorKey, HTMLElement>();
const hallUpBtns = new Map<number, HTMLButtonElement>();
const hallDnBtns = new Map<number, HTMLButtonElement>();

function populateSelects(): void {
  [hallFloorSel, destFloorSel].forEach((sel) => {
    sel.innerHTML = "";
    for (let f = MAX_FLOOR; f >= MIN_FLOOR; f--) {
      const opt = document.createElement("option");
      opt.value = String(f);
      opt.textContent = `Floor ${f}`;
      sel.appendChild(opt);
    }
  });

  destElSel.innerHTML = "";
  for (let i = 0; i < NUM_ELEVATORS; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Elevator ${i}`;
    destElSel.appendChild(opt);
  }
}

function buildGrid(): void {
  buildingEl.style.gridTemplateColumns = `36px 46px repeat(${NUM_ELEVATORS}, 88px)`;
  buildingEl.innerHTML = "";
  carEls.clear(); arrowEls.clear(); cellEls.clear();
  hallUpBtns.clear(); hallDnBtns.clear();

  // Header row
  buildingEl.appendChild(el("div", "floor-label"));
  buildingEl.appendChild(el("div", "hall-cell shaft-header", "HALL"));
  for (let e = 0; e < NUM_ELEVATORS; e++) {
    buildingEl.appendChild(el("div", "shaft-cell shaft-header", `E${e}`));
  }

  // Floor rows
  for (const floor of FLOORS) {
    buildingEl.appendChild(el("div", "floor-label", String(floor)));

    const hallCell = el("div", "hall-cell");
    const upBtn = document.createElement("button");
    upBtn.className = "hall-btn";
    upBtn.textContent = "▲";
    upBtn.title = `Hall call Up from floor ${floor}`;
    upBtn.addEventListener("click", () => submitHallCall(floor, RequestType.PickupUp));

    const dnBtn = document.createElement("button");
    dnBtn.className = "hall-btn";
    dnBtn.textContent = "▼";
    dnBtn.title = `Hall call Down from floor ${floor}`;
    dnBtn.addEventListener("click", () => submitHallCall(floor, RequestType.PickupDown));

    hallCell.append(upBtn, dnBtn);
    buildingEl.appendChild(hallCell);
    hallUpBtns.set(floor, upBtn);
    hallDnBtns.set(floor, dnBtn);

    for (let e = 0; e < NUM_ELEVATORS; e++) {
      const key: ElevatorFloorKey = `${e}-${floor}`;
      const cell = el("div", "shaft-cell");
      const car  = el("div", "elevator-car");

      const arrow   = el("span", "car-arrow");
      const floorLbl = el("span", "car-floor-num", String(floor));
      car.append(arrow, floorLbl);
      cell.appendChild(car);
      buildingEl.appendChild(cell);

      carEls.set(key, car);
      arrowEls.set(key, arrow);
      cellEls.set(key, cell);
    }
  }
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render(): void {
  tickCountEl.textContent = String(ctrl.currentTick);

  const snapshots = ctrl.snapshot();

  for (let e = 0; e < NUM_ELEVATORS; e++) {
    const snap = snapshots[e]!;

    // Clear all positions for this elevator
    for (const floor of FLOORS) {
      const key: ElevatorFloorKey = `${e}-${floor}`;
      carEls.get(key)?.classList.remove("visible");
      const cell = cellEls.get(key);
      if (cell) cell.querySelector(".stop-dot")?.remove();
    }

    // Show car at current position
    const activeKey: ElevatorFloorKey = `${e}-${snap.currentFloor}`;
    carEls.get(activeKey)?.classList.add("visible");
    const arrow = arrowEls.get(activeKey);
    if (arrow) {
      arrow.textContent =
        snap.direction === Direction.Up ? "▲" :
        snap.direction === Direction.Down ? "▼" : "•";
    }

    // Pending stop dots
    for (const floor of snap.pendingFloors) {
      if (floor === snap.currentFloor) continue;
      const cell = cellEls.get(`${e}-${floor}` as ElevatorFloorKey);
      if (cell) {
        const dot = el("div", "stop-dot");
        cell.appendChild(dot);
      }
    }
  }

  for (const floor of FLOORS) {
    hallUpBtns.get(floor)?.classList.toggle("active-up",   ctrl.hasPendingHallCall(floor, RequestType.PickupUp));
    hallDnBtns.get(floor)?.classList.toggle("active-down", ctrl.hasPendingHallCall(floor, RequestType.PickupDown));
  }
}

function log(msg: string, cls = ""): void {
  const li = el("li", cls, msg);
  logEl.prepend(li);
  while (logEl.children.length > 60) logEl.lastChild?.remove();
}

function submitHallCall(floor: number, type: RequestType.PickupUp | RequestType.PickupDown): void {
  try {
    const id = ctrl.requestHallCall({ floor, type });
    if (id === null) {
      log(`[T${ctrl.currentTick}] Hall ${type} @ ${floor}: already queued`, "noop");
    } else {
      log(`[T${ctrl.currentTick}] Hall ${type} @ ${floor} → E${id}`, "assign");
    }
  } catch (e) {
    log(`Error: ${(e as Error).message}`, "error");
  }
  render();
}

function submitDestination(): void {
  const elevatorId = parseInt(destElSel.value, 10);
  const floor = parseInt(destFloorSel.value, 10);
  try {
    const added = ctrl.requestDestination(elevatorId, floor);
    log(
      added
        ? `[T${ctrl.currentTick}] E${elevatorId} dest → floor ${floor}`
        : `[T${ctrl.currentTick}] E${elevatorId} dest @ ${floor}: duplicate`,
      added ? "assign" : "noop",
    );
  } catch (e) {
    log(`Error: ${(e as Error).message}`, "error");
  }
  render();
}

function stepOnce(): void {
  const result = ctrl.step();
  result.arrivals.forEach((floor, elevatorId) => {
    log(`[T${result.tick}] E${elevatorId} arrived at floor ${floor}`, "arrival");
  });
  render();
}

function togglePlay(): void {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    btnPlay.textContent = "Auto ▶▶";
    btnPlay.classList.remove("playing");
  } else {
    btnPlay.textContent = "Pause ⏸";
    btnPlay.classList.add("playing");
    const fps = parseInt(speedInput.value, 10);
    playInterval = setInterval(stepOnce, 1000 / fps);
  }
}

function reset(): void {
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = null;
    btnPlay.textContent = "Auto ▶▶";
    btnPlay.classList.remove("playing");
  }
  ctrl = makeController();
  logEl.innerHTML = "";
  buildGrid();
  render();
  log("Simulation reset.", "noop");
}

btnStep.addEventListener("click", stepOnce);
btnPlay.addEventListener("click", togglePlay);
btnReset.addEventListener("click", reset);
btnPickupUp.addEventListener("click", () => submitHallCall(parseInt(hallFloorSel.value, 10), RequestType.PickupUp));
btnPickupDn.addEventListener("click", () => submitHallCall(parseInt(hallFloorSel.value, 10), RequestType.PickupDown));
btnDest.addEventListener("click", submitDestination);
speedInput.addEventListener("input", () => {
  const fps = parseInt(speedInput.value, 10);
  speedLabel.textContent = `${fps} fps`;
  if (playInterval) {
    clearInterval(playInterval);
    playInterval = setInterval(stepOnce, 1000 / fps);
  }
});

populateSelects();
buildGrid();
render();
log("Ready. Add requests or step the simulation.", "noop");
