import { describe, expect, test } from "vitest";

import { compareResults, getMetrics, getResult } from "../src/domain/metrics";
import { createScenario } from "../src/domain/scenario";
import { createRun, finish } from "../src/domain/simulation";
import type { CompletedResult } from "../src/domain/types";
import { singleA } from "./fixtures";

const config = { placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" } as const;

describe("metrics", () => {
  test("uses null for unavailable averages and completion time", () => {
    const metrics = getMetrics(createRun(config, createScenario("popularNear")));
    expect(metrics.averageLeadTicks).toBeNull();
    expect(metrics.lastShipmentTicks).toBeNull();
  });

  test("excludes truck departure from the last shipment time", () => {
    const state = finish(config, singleA("popularNear"));
    const metrics = getMetrics(state);
    expect(metrics.averageLeadTicks).toBe(390);
    expect(metrics.lastShipmentTicks).toBe(390);
    expect(state.timeTick).toBe(470);
  });

  test("returns a completed result only for finished state", () => {
    expect(getResult(createRun(config, singleA("popularNear")))).toBeNull();
    expect(getResult(finish(config, singleA("popularNear")))?.orders).toEqual([{ id: "test-01", arrivalTick: 0, shippedTick: 390 }]);
  });
});

describe("comparison", () => {
  const result = getResult(finish(config, singleA("popularNear")))!;
  test("rejects different model and scenario versions", () => {
    expect(compareResults({ ...result, modelVersion: "other" }, result).ok).toBe(false);
    expect(compareResults({ ...result, scenarioId: "other" }, result).ok).toBe(false);
  });

  test("subtracts raw values before display rounding", () => {
    const base: CompletedResult = { ...result, averageLeadTicks: 596 };
    const current: CompletedResult = { ...result, averageLeadTicks: 604 };
    const comparison = compareResults(base, current);
    expect(comparison.ok).toBe(true);
    if (comparison.ok) expect(comparison.deltas.averageLeadTicks).toBe(8);
  });
});
