import { isFloorPoint, shortestPath } from "./routing";
import { ARRIVAL_PATTERNS, createScenario, DEFAULT_TIMINGS, ORDER_SKUS } from "./scenario";
import type { Arrival, Placement, RunConfig, Scenario, ValidationResult } from "./types";

const PLACEMENTS = ["popularFar", "popularNear"] as const;
const STAFFING = ["pick1Pack1", "pick1Pack2", "pick2Pack1", "pick2Pack2", "pick3Pack1"] as const;
const TRANSPORT = ["single", "cart2", "cart3", "cart5"] as const;
const ARRIVALS = ["steady", "burst", "waves"] as const;
const PACKING = ["standard", "tooled"] as const;

function hasValue<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function samePoint(left: { x: number; y: number }, right: { x: number; y: number }): boolean {
  return left.x === right.x && left.y === right.y;
}

export function validate(config: unknown, scenario: Scenario): ValidationResult {
  const errors: string[] = [];
  const input = config && typeof config === "object" ? config as Partial<RunConfig> : {};
  if (!hasValue(PLACEMENTS, input.placement)) errors.push("棚配置が許可された値ではありません");
  if (!hasValue(STAFFING, input.staffing)) errors.push("担当配分が許可された値ではありません");
  if (!hasValue(TRANSPORT, input.transport)) errors.push("運び方が許可された値ではありません");
  if (!hasValue(ARRIVALS, input.arrival)) errors.push("注文の入り方が許可された値ではありません");
  if (!hasValue(PACKING, input.packing)) errors.push("梱包の速さが許可された値ではありません");

  if (!scenario.id || !scenario.modelVersion) errors.push("シナリオIDまたはモデル版がありません");
  if (scenario.orders.length !== 24) errors.push("注文は固定の24件である必要があります");
  const arrivalOf = hasValue(ARRIVALS, input.arrival) ? ARRIVAL_PATTERNS[input.arrival as Arrival] : null;
  scenario.orders.forEach((order, index) => {
    const expectedArrival = arrivalOf ? arrivalOf(index) : order.arrivalTick;
    if (order.id !== `ID${String(index + 1).padStart(2, "0")}` || order.sku !== ORDER_SKUS[index] || order.arrivalTick !== expectedArrival) {
      errors.push(`注文${index + 1}のID・商品・到着列が固定条件と一致しません`);
    }
  });

  const shelfIds = new Set(scenario.shelves.map((shelf) => shelf.id));
  const shelfSkus = new Set(scenario.shelves.map((shelf) => shelf.sku));
  if (scenario.shelves.length !== 6 || shelfIds.size !== 6) errors.push("棚IDはS1〜S6の6件で重複できません");
  if (shelfSkus.size !== 6) errors.push("棚の商品IDはA〜Fで重複できません");
  for (const shelf of scenario.shelves) {
    if (!isFloorPoint(shelf.position) || !isFloorPoint(shelf.pickup)) errors.push(`${shelf.id}の座標が床の範囲外です`);
  }
  for (const point of scenario.blocked) {
    if (!isFloorPoint(point)) errors.push("通行不可座標が床の範囲外です");
  }
  if (!isFloorPoint(scenario.depot)) errors.push("受け渡し位置が床の範囲外です");

  for (const [name, value] of Object.entries(scenario.timings)) {
    if (!Number.isInteger(value) || value <= 0) errors.push(`${name}の時間は正の整数tickである必要があります`);
  }
  for (const [name, expected] of Object.entries(DEFAULT_TIMINGS)) {
    if (scenario.timings[name as keyof typeof DEFAULT_TIMINGS] !== expected) errors.push(`${name}の時間が固定条件と一致しません`);
  }

  if (hasValue(PLACEMENTS, input.placement)) {
    const expected = createScenario(input.placement as Placement, hasValue(ARRIVALS, input.arrival) ? input.arrival as Arrival : undefined);
    scenario.shelves.forEach((shelf, index) => {
      const fixed = expected.shelves[index];
      if (!fixed || shelf.id !== fixed.id || shelf.sku !== fixed.sku || !samePoint(shelf.position, fixed.position) || !samePoint(shelf.pickup, fixed.pickup)) {
        errors.push(`${shelf.id}の棚配置が固定条件と一致しません`);
      }
    });
  }

  if (isFloorPoint(scenario.depot)) {
    for (const shelf of scenario.shelves) {
      if (!isFloorPoint(shelf.pickup)) continue;
      try {
        shortestPath(scenario.depot, shelf.pickup, scenario.blocked);
      } catch {
        errors.push(`${shelf.id}への経路がありません`);
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors: [...new Set(errors)] };
}
