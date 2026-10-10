import { createScenario } from "../src/domain/scenario";
import type { Placement, Scenario } from "../src/domain/types";

export function singleA(placement: Placement): Scenario {
  const scenario = createScenario(placement);
  return { ...scenario, id: `test-single-a-${placement}`, orders: [{ id: "test-01", sku: "A", arrivalTick: 0 }] };
}

export function manyA(count: number): Scenario {
  const scenario = createScenario("popularNear");
  return {
    ...scenario,
    id: `test-many-a-${count}`,
    orders: Array.from({ length: count }, (_, index) => ({ id: `test-${index + 1}`, sku: "A" as const, arrivalTick: 0 })),
  };
}

export function threeA(): Scenario {
  const scenario = createScenario("popularNear");
  return {
    ...scenario,
    id: "test-three-a",
    orders: Array.from({ length: 3 }, (_, index) => ({ id: `test-${index + 1}`, sku: "A" as const, arrivalTick: 0 })),
  };
}
