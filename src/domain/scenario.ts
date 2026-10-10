import type { Arrival, PackingSpeed, Placement, Scenario, Shelf, Sku, Staffing, Timings, Transport } from "./types";

export const MODEL_VERSION = "dispatch-lab-1";
export const ORDER_SKUS: readonly Sku[] = ["A", "B", "A", "C", "A", "B", "A", "D", "A", "B", "A", "C", "A", "B", "A", "E", "A", "B", "A", "C", "A", "B", "A", "F"];

const SHELVES = [
  { id: "S1", position: { x: 2, y: 2 }, pickup: { x: 2, y: 3 }, blocked: [{ x: 2, y: 2 }, { x: 3, y: 2 }] },
  { id: "S2", position: { x: 5, y: 2 }, pickup: { x: 5, y: 3 }, blocked: [{ x: 5, y: 2 }, { x: 6, y: 2 }] },
  { id: "S3", position: { x: 8, y: 2 }, pickup: { x: 8, y: 3 }, blocked: [{ x: 8, y: 2 }, { x: 9, y: 2 }] },
  { id: "S4", position: { x: 2, y: 5 }, pickup: { x: 2, y: 6 }, blocked: [{ x: 2, y: 5 }, { x: 3, y: 5 }] },
  { id: "S5", position: { x: 5, y: 5 }, pickup: { x: 5, y: 6 }, blocked: [{ x: 5, y: 5 }, { x: 6, y: 5 }] },
  { id: "S6", position: { x: 8, y: 5 }, pickup: { x: 8, y: 6 }, blocked: [{ x: 8, y: 5 }, { x: 9, y: 5 }] },
] as const;

const SKUS_BY_PLACEMENT: Record<Placement, readonly Sku[]> = {
  popularNear: ["F", "E", "C", "D", "B", "A"],
  popularFar: ["A", "B", "D", "C", "E", "F"],
};

export const DEFAULT_TIMINGS: Readonly<Timings> = {
  singleEdge: 10,
  cartEdge: 12,
  picking: 40,
  unloadingBase: 20,
  unloadingPerItem: 10,
  packing: 160,
  conveying: 60,
  truckDeparture: 80,
};

/** 注文の入り方。合計24件・商品の並びは変えず、到着時刻だけを決める。 */
export const ARRIVAL_PATTERNS: Record<Arrival, (index: number) => number> = {
  steady: (index) => index * 120,
  burst: (index) => (index < 18 ? index * 10 : 900 + (index - 18) * 120),
  waves: (index) => Math.floor(index / 8) * 900 + (index % 8) * 20,
};

/** 1便で運べる件数。 */
export const CART_CAPACITY: Record<Transport, number> = { single: 1, cart2: 2, cart3: 3, cart5: 5 };

/** 梱包1件あたりのtick。道具を整えた台は短くなる。 */
export const PACKING_TICKS: Record<PackingSpeed, number> = { standard: 160, tooled: 120 };

/** 担当の内訳。梱包台は2台までなので梱包担当は2人まで。 */
export const STAFFING_PLAN: Record<Staffing, { pickers: number; packers: number }> = {
  pick1Pack1: { pickers: 1, packers: 1 },
  pick1Pack2: { pickers: 1, packers: 2 },
  pick2Pack1: { pickers: 2, packers: 1 },
  pick2Pack2: { pickers: 2, packers: 2 },
  pick3Pack1: { pickers: 3, packers: 1 },
};

export function createScenario(placement: Placement, arrival: Arrival = "steady"): Scenario {
  const skus = SKUS_BY_PLACEMENT[placement];
  const shelves: Shelf[] = SHELVES.map((shelf, index) => ({
    id: shelf.id,
    position: { ...shelf.position },
    pickup: { ...shelf.pickup },
    sku: skus[index],
  }));
  return {
    id: "fixed-24-orders-v1",
    modelVersion: MODEL_VERSION,
    orders: ORDER_SKUS.map((sku, index) => ({ id: `ID${String(index + 1).padStart(2, "0")}`, sku, arrivalTick: ARRIVAL_PATTERNS[arrival](index) })),
    shelves,
    blocked: SHELVES.flatMap((shelf) => shelf.blocked.map((point) => ({ ...point }))),
    depot: { x: 11, y: 8 },
    timings: { ...DEFAULT_TIMINGS },
  };
}
