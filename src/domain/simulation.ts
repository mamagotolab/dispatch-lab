import { shortestPath } from "./routing";
import { CART_CAPACITY, PACKING_TICKS, STAFFING_PLAN } from "./scenario";
import type { DomainEvent, PickerTrip, Point, RunConfig, Scenario, SimulationOrder, SimulationState, WorkerId, WorkerState } from "./types";

function clone<T>(value: T): T { return structuredClone(value); }
function byId<T extends { id: string }>(left: T, right: T): number { return left.id.localeCompare(right.id); }
function order(state: SimulationState, id: string): SimulationOrder { return state.orders.find((item) => item.id === id)!; }

const PACKING_STATIONS = [{ station: 1, position: { x: 10, y: 9 } }, { station: 2, position: { x: 12, y: 9 } }] as const;

/** 収集担当を先に、次に梱包担当をW1から順に採番する。走査順は割当の優先順でもある。 */
function workers(config: RunConfig, depot: Point): WorkerState[] {
  const plan = STAFFING_PLAN[config.staffing];
  const list: WorkerState[] = [];
  for (let index = 0; index < plan.pickers; index += 1) {
    list.push({ id: `W${list.length + 1}` as WorkerId, role: "picker", position: { ...depot }, action: { type: "idle" }, distance: 0 });
  }
  for (let index = 0; index < plan.packers; index += 1) {
    const station = PACKING_STATIONS[index];
    list.push({ id: `W${list.length + 1}` as WorkerId, role: "packer", station: station.station, position: { ...station.position }, action: { type: "idle" }, distance: 0 });
  }
  return list;
}

function startMove(state: SimulationState, worker: WorkerState, to: Point, purpose: "toShelf" | "return"): void {
  const path = shortestPath(worker.position, to, state.scenario.blocked);
  const edges = path.length - 1;
  if (edges === 0) { if (worker.trip) worker.trip.phase = purpose === "return" ? "atDepot" : "atShelf"; return; }
  const edgeTicks = state.config.transport === "single" ? state.scenario.timings.singleEdge : state.scenario.timings.cartEdge;
  worker.action = { type: "moving", path, startTick: state.timeTick, endTick: state.timeTick + edges * edgeTicks, purpose };
  if (worker.trip) worker.trip.phase = purpose === "return" ? "returning" : "moving";
}

function orderStops(state: SimulationState, selected: SimulationOrder[]): PickerTrip["stops"] {
  const groups = new Map<string, string[]>();
  for (const item of selected) {
    const shelf = state.scenario.shelves.find((candidate) => candidate.sku === item.sku)!;
    groups.set(shelf.id, [...(groups.get(shelf.id) ?? []), item.id]);
  }
  const stops: PickerTrip["stops"] = [];
  let current = state.scenario.depot;
  while (groups.size > 0) {
    const candidates = [...groups].map(([shelfId, orderIds]) => {
      const shelf = state.scenario.shelves.find((item) => item.id === shelfId)!;
      return { shelf, orderIds: [...orderIds].sort(), distance: shortestPath(current, shelf.pickup, state.scenario.blocked).length - 1 };
    }).sort((left, right) => left.distance - right.distance || left.shelf.id.localeCompare(right.shelf.id));
    const next = candidates[0];
    stops.push({ shelfId: next.shelf.id, pickup: { ...next.shelf.pickup }, orderIds: next.orderIds, nextOrderIndex: 0 });
    current = next.shelf.pickup;
    groups.delete(next.shelf.id);
  }
  return stops;
}

function assignPickers(state: SimulationState, events: DomainEvent[]): void {
  for (const worker of state.workers.filter((item) => item.role === "picker").sort(byId)) {
    if (worker.action.type !== "idle" || worker.trip) continue;
    const waiting = state.orders.filter((item) => item.state === "waiting").sort((a, b) => a.arrivalTick - b.arrivalTick || a.id.localeCompare(b.id));
    const selected = waiting.slice(0, CART_CAPACITY[state.config.transport]);
    if (selected.length === 0) continue;
    for (const item of selected) { item.state = "assigned"; item.workerId = worker.id; events.push({ type: "assigned", tick: state.timeTick, orderId: item.id, workerId: worker.id }); }
    worker.trip = { orderIds: selected.map((item) => item.id), stops: orderStops(state, selected), stopIndex: 0, phase: "moving" };
    startMove(state, worker, worker.trip.stops[0].pickup, "toShelf");
  }
}

function continueTrips(state: SimulationState): void {
  for (const worker of state.workers.filter((item) => item.role === "picker").sort(byId)) {
    if (worker.action.type !== "idle" || !worker.trip) continue;
    const trip = worker.trip;
    if (trip.phase === "atShelf") {
      const stop = trip.stops[trip.stopIndex];
      if (stop.nextOrderIndex < stop.orderIds.length) {
        const orderId = stop.orderIds[stop.nextOrderIndex];
        worker.action = { type: "picking", orderId, startTick: state.timeTick, endTick: state.timeTick + state.scenario.timings.picking };
      } else if (trip.stopIndex + 1 < trip.stops.length) {
        trip.stopIndex += 1; startMove(state, worker, trip.stops[trip.stopIndex].pickup, "toShelf");
      } else startMove(state, worker, state.scenario.depot, "return");
    } else if (trip.phase === "atDepot") {
      const duration = state.scenario.timings.unloadingBase + state.scenario.timings.unloadingPerItem * trip.orderIds.length;
      worker.action = { type: "unloading", orderIds: [...trip.orderIds], startTick: state.timeTick, endTick: state.timeTick + duration };
    }
  }
}

function assignPackers(state: SimulationState, events: DomainEvent[]): void {
  for (const worker of state.workers.filter((item) => item.role === "packer").sort(byId)) {
    if (worker.action.type !== "idle") continue;
    const next = state.orders.filter((item) => item.state === "packingQueue").sort((a, b) => (a.unloadedTick! - b.unloadedTick!) || a.id.localeCompare(b.id))[0];
    if (!next) continue;
    next.state = "packing"; next.workerId = worker.id; next.packingStartedTick = state.timeTick;
    worker.action = { type: "packing", orderId: next.id, startTick: state.timeTick, endTick: state.timeTick + state.scenario.timings.packing };
    events.push({ type: "packingStarted", tick: state.timeTick, orderId: next.id, workerId: worker.id });
  }
}

function completeActions(state: SimulationState, events: DomainEvent[]): void {
  for (const worker of [...state.workers].sort(byId)) {
    const action = worker.action;
    if (action.type === "idle" || action.endTick !== state.timeTick) continue;
    if (action.type === "moving") {
      worker.position = { ...action.path.at(-1)! }; worker.distance += action.path.length - 1; if (worker.trip) worker.trip.phase = action.purpose === "return" ? "atDepot" : "atShelf";
    } else if (action.type === "picking") {
      const item = order(state, action.orderId); item.state = "picked"; item.pickedTick = state.timeTick;
      const stop = worker.trip!.stops[worker.trip!.stopIndex]; stop.nextOrderIndex += 1;
      events.push({ type: "itemPicked", tick: state.timeTick, orderId: item.id, workerId: worker.id });
    } else if (action.type === "unloading") {
      for (const id of [...action.orderIds].sort()) { const item = order(state, id); item.state = "packingQueue"; item.unloadedTick = state.timeTick; events.push({ type: "unloaded", tick: state.timeTick, orderId: id, workerId: worker.id }); }
      worker.trip = undefined;
    } else if (action.type === "packing") {
      const item = order(state, action.orderId); item.state = "conveying"; item.packedTick = state.timeTick; item.conveyEndTick = state.timeTick + state.scenario.timings.conveying;
      events.push({ type: "packed", tick: state.timeTick, orderId: item.id, workerId: worker.id });
    }
    worker.action = { type: "idle" };
  }
  for (const item of state.orders.filter((candidate) => candidate.state === "conveying" && candidate.conveyEndTick === state.timeTick).sort(byId)) {
    item.state = "shipped"; item.shippedTick = state.timeTick; events.push({ type: "shipped", tick: state.timeTick, orderId: item.id });
  }
}

function arrive(state: SimulationState, events: DomainEvent[]): void {
  for (const item of state.orders.filter((candidate) => candidate.state === "scheduled" && candidate.arrivalTick === state.timeTick).sort(byId)) {
    item.state = "waiting"; events.push({ type: "arrived", tick: state.timeTick, orderId: item.id });
  }
}

function startTruckIfReady(state: SimulationState): void {
  if (state.truck.status === "waiting" && state.orders.length > 0 && state.orders.every((item) => item.state === "shipped")) {
    state.truck = { status: "departing", startTick: state.timeTick, endTick: state.timeTick + state.scenario.timings.truckDeparture };
  }
}

export function createRun(config: RunConfig, scenario: Scenario): SimulationState {
  const preparedScenario = clone(scenario);
  // 梱包の速さは利用者が選ぶ条件なので、実行するシナリオの時間定数へ写す。
  preparedScenario.timings.packing = PACKING_TICKS[config.packing];
  const state: SimulationState = { timeTick: 0, status: "active", config: clone(config), scenario: preparedScenario, orders: preparedScenario.orders.map((item) => ({ ...item, state: "scheduled" })), workers: workers(config, preparedScenario.depot), truck: { status: "waiting" }, maximumPackingQueue: 0 };
  const events: DomainEvent[] = []; arrive(state, events); assignPackers(state, events); assignPickers(state, events); return state;
}

export function step(input: SimulationState): { state: SimulationState; events: DomainEvent[] } {
  if (input.status !== "active") return { state: clone(input), events: [] };
  const state = clone(input); const events: DomainEvent[] = []; state.timeTick += 1;
  if (state.truck.status === "departing" && state.truck.endTick === state.timeTick) { state.truck.status = "departed"; state.status = "finished"; events.push({ type: "truckDeparted", tick: state.timeTick }); return { state, events }; }
  completeActions(state, events); arrive(state, events); continueTrips(state);
  state.maximumPackingQueue = Math.max(state.maximumPackingQueue, state.orders.filter((item) => item.state === "packingQueue").length);
  assignPackers(state, events); assignPickers(state, events); startTruckIfReady(state); return { state, events };
}

export function finish(config: RunConfig, scenario: Scenario): SimulationState {
  let state = createRun(config, scenario);
  while (state.status === "active" && state.timeTick < 100000) state = step(state).state;
  if (state.status === "active") throw new Error("シミュレーションが100000tick以内に完了しませんでした");
  return state;
}
