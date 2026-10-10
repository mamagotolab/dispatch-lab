import type { RunConfig, SimulationState, WorkerAction, WorkerState } from "../domain/types";
import type { Facing, PersonInput, Pose } from "./people";
import type { Point } from "./projection";
import { getDockLayout } from "./props";

export interface ViewState { showRoutes: boolean; reducedMotion: boolean; selectedOrderId: string | null; }
export interface ScenePerson extends PersonInput { role: WorkerState["role"]; station?: WorkerState["station"]; action: WorkerAction["type"]; }
export interface SceneFrame {
  people: ScenePerson[];
  shelves: SimulationState["scenario"]["shelves"];
  blocked: Point[];
  routes: Point[][];
  carts: { workerId: string; position: Point; facing: Facing; loaded: number }[];
  packages: { orderId: string; position: Point; baseZ: number; selected: boolean; showBox: boolean }[];
  /** 仮置き場に描くのは6件までで、残りの件数。合計は場の見出しに出す。 */
  hiddenQueuePackages: number;
  timeTick: number;
  shipped: number;
  waiting: number;
  packingQueue: number;
  truckStatus: SimulationState["truck"]["status"];
  truckLoaded: number;
  conditionSummary: string;
  time: number;
  motion: boolean;
}

/** 画面に出す条件の短い日本語。操作パネルの選択肢と同じ意味で書く。 */
const CONDITION_LABELS = {
  placement: { popularNear: "人気商品は近く", popularFar: "人気商品は奥" },
  arrival: { steady: "一定ペース", burst: "朝にまとめて", waves: "波がある" },
  staffing: { pick1Pack1: "収集1・梱包1", pick1Pack2: "収集1・梱包2", pick2Pack1: "収集2・梱包1", pick2Pack2: "収集2・梱包2", pick3Pack1: "収集3・梱包1" },
  transport: { single: "1件ずつ", cart2: "台車2件", cart3: "台車3件", cart5: "台車5件" },
  packing: { standard: "梱包16秒", tooled: "梱包12秒" },
} as const;

export function describeConfig(config: RunConfig): string {
  return [CONDITION_LABELS.placement[config.placement], CONDITION_LABELS.arrival[config.arrival], CONDITION_LABELS.staffing[config.staffing], CONDITION_LABELS.transport[config.transport], CONDITION_LABELS.packing[config.packing]].join("　/　");
}

const CART_FACING: Record<Facing, Facing> = { se: "se", sw: "sw", nw: "nw", ne: "ne" };

/** 台車の置き場所。人物の手と取っ手が画面上で重なる位置を向きごとに決めてある。 */
const CART_OFFSET: Record<Facing, Point> = {
  se: { x: 0.973, y: -0.353 },
  ne: { x: 0.265, y: -1.061 },
  sw: { x: -0.353, y: 0.973 },
  nw: { x: -1.061, y: 0.265 },
};

/** 手で持つ商品の置き場所。人物の手の位置に合わせてある。 */
const HAND_OFFSET: Record<Facing, Point> = {
  se: { x: 0.72, y: 0.02 },
  ne: { x: 0.72, y: 0.02 },
  sw: { x: 0.02, y: 0.72 },
  nw: { x: 0.02, y: 0.72 },
};

/** 止まっているあいだの台車の置き場所。棚や作業台に重ならない通路側へ寄せる。 */
const CART_PARK: Record<"picking" | "other", Point> = { picking: { x: 0.85, y: 0.15 }, other: { x: 1.1, y: -0.6 } };

export function cartSpot(person: Point, direction: Facing, action: WorkerAction["type"] = "moving"): Point {
  const offset = action === "moving" ? CART_OFFSET[direction] : CART_PARK[action === "picking" ? "picking" : "other"];
  return { x: person.x + offset.x, y: person.y + offset.y };
}

export function handSpot(person: Point, direction: Facing): Point {
  return { x: person.x + HAND_OFFSET[direction].x, y: person.y + HAND_OFFSET[direction].y };
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function facing(from: Point, to: Point): Facing {
  const dx = to.x - from.x; const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "se" : "nw";
  return dy >= 0 ? "sw" : "ne";
}

function movingPosition(action: Extract<WorkerAction, { type: "moving" }>, time: number, reduced: boolean): { position: Point; facing: Facing; phase: number } {
  const edges = action.path.length - 1;
  const pathProgress = clamp((time - action.startTick) / (action.endTick - action.startTick)) * edges;
  const edge = Math.min(edges - 1, Math.floor(pathProgress));
  const fraction = reduced ? 0 : pathProgress - edge;
  const from = action.path[Math.max(0, edge)]; const to = action.path[Math.max(1, edge + 1)];
  return { position: { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }, facing: facing(from, to), phase: fraction };
}

function personFrame(worker: WorkerState, time: number, reduced: boolean, load: "none" | "cart" | "hands"): ScenePerson {
  let position = { ...worker.position }; let direction: Facing = worker.role === "packer" ? "ne" : "nw"; let pose: Pose = "idle"; let walkPhase = 0;
  if (worker.action.type === "moving") {
    const moving = movingPosition(worker.action, time, reduced); position = moving.position; direction = moving.facing; walkPhase = moving.phase;
    pose = load === "cart" ? "push" : load === "hands" ? "carry" : "walk";
  } else if (worker.action.type === "picking") { pose = "pick"; direction = "ne"; }
  else if (worker.action.type === "unloading") { pose = "unload"; direction = "ne"; }
  else if (worker.action.type === "packing") {
    const progress = clamp((time - worker.action.startTick) / (worker.action.endTick - worker.action.startTick));
    pose = progress < 1 / 3 ? "pack-open" : progress < 2 / 3 ? "pack-fill" : "pack-seal";
  }
  return { position, facing: direction, pose, walkPhase, workerId: worker.id, role: worker.role, station: worker.station, action: worker.action.type };
}

export function buildSceneFrame(state: Readonly<SimulationState>, fraction: number, view: ViewState): SceneFrame {
  const dock = getDockLayout();
  const time = state.timeTick + (view.reducedMotion ? 0 : fraction);
  const usesCart = state.config.transport !== "single";
  const carried = (worker: WorkerState): "none" | "cart" | "hands" => {
    if (!worker.trip) return "none";
    if (usesCart) return "cart";
    return worker.trip.orderIds.some((id) => state.orders.find((order) => order.id === id)?.state === "picked") ? "hands" : "none";
  };
  const people = state.workers.map((worker) => personFrame(worker, time, view.reducedMotion, carried(worker)));
  const positionOf = (workerId?: string) => people.find((person) => person.workerId === workerId);
  const stationX = (workerId?: string) => (state.workers.find((worker) => worker.id === workerId)?.station === 2 ? 12 : 10);
  const carts = usesCart
    ? people.filter((person) => person.role === "picker" && state.workers.find((worker) => worker.id === person.workerId)?.trip)
      .map((person) => {
        const trip = state.workers.find((worker) => worker.id === person.workerId)!.trip!;
        const loaded = trip.orderIds.filter((id) => state.orders.find((order) => order.id === id)?.state === "picked").length;
        return { workerId: person.workerId, position: cartSpot(person.position, person.facing, person.action), facing: person.action === "moving" ? person.facing : "se", loaded };
      })
    : [];
  const waitingAtDepot = state.workers.filter((worker) => worker.role === "picker" && worker.action.type === "idle" && !worker.trip).map((worker) => worker.id);
  if (waitingAtDepot.length > 1) {
    for (const person of people) {
      const index = waitingAtDepot.indexOf(person.workerId);
      if (index >= 0) person.position = { x: person.position.x + (index - (waitingAtDepot.length - 1) / 2) * 0.55, y: person.position.y };
    }
  }
  const queued = state.orders.filter((order) => order.state === "packingQueue").sort((a, b) => (a.unloadedTick! - b.unloadedTick!) || a.id.localeCompare(b.id));
  const packages = state.orders.flatMap((item) => {
    let position: Point | null = null; let baseZ = 39; let showBox = true;
    if (item.state === "picked") {
      const person = positionOf(item.workerId);
      const cart = carts.find((candidate) => candidate.workerId === item.workerId);
      if (cart) {
        const onCart = state.workers.find((worker) => worker.id === item.workerId)!.trip!.orderIds.filter((id) => state.orders.find((order) => order.id === id)?.state === "picked");
        const slot = onCart.indexOf(item.id);
        const column = slot % 3; const level = Math.floor(slot / 3);
        const inRow = level === 0 ? Math.min(onCart.length, 3) : onCart.length - 3;
        position = { x: cart.position.x + (column - (inRow - 1) / 2) * 0.32, y: cart.position.y };
        baseZ = 17 + level * 13;
      } else if (person) { position = handSpot(person.position, person.facing); baseZ = 39; }
    } else if (item.state === "packingQueue") {
      const index = queued.findIndex((order) => order.id === item.id);
      if (index < 6) { position = { x: 10.5 + (index % 3) * 0.45, y: 7.25 + Math.floor(index / 3) * 0.45 }; baseZ = 0; }
    } else if (item.state === "packing") {
      // 梱包中の箱は作業台の表現が担当するため、ここでは選択マークの位置だけを返す。
      position = { x: stationX(item.workerId) + 0.06, y: 8.44 }; baseZ = 39; showBox = false;
    } else if (item.state === "conveying") {
      const from = stationX(item.workerId);
      const progress = clamp(1 - (item.conveyEndTick! - time) / state.scenario.timings.conveying);
      position = { x: from + (dock.beltToX - 0.3 - from) * progress, y: dock.beltY }; baseZ = dock.beltZ;
    }
    return position ? [{ orderId: item.id, position, baseZ, selected: item.id === view.selectedOrderId, showBox }] : [];
  });
  return {
    people,
    shelves: state.scenario.shelves,
    blocked: state.scenario.blocked,
    routes: view.showRoutes ? state.workers.flatMap((worker) => worker.action.type === "moving" ? [worker.action.path] : []) : [],
    carts,
    packages,
    hiddenQueuePackages: Math.max(0, queued.length - 6),
    timeTick: state.timeTick,
    shipped: state.orders.filter((order) => order.state === "shipped").length,
    waiting: state.orders.filter((order) => order.state === "waiting").length,
    packingQueue: state.orders.filter((order) => order.state === "packingQueue").length,
    truckStatus: state.truck.status,
    truckLoaded: state.orders.filter((order) => order.state === "shipped").length,
    conditionSummary: describeConfig(state.config),
    time,
    motion: !view.reducedMotion,
  };
}

export { CART_FACING };
