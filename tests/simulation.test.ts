import { describe, expect, test } from "vitest";

import { ARRIVAL_PATTERNS, createScenario } from "../src/domain/scenario";
import { createRun, finish, step } from "../src/domain/simulation";
import type { RunConfig } from "../src/domain/types";
import { manyA, singleA, threeA } from "./fixtures";

const single: RunConfig = { placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" };

describe("hand-calculated completion times", () => {
  test("one near A ships at 39 seconds and finishes at 47", () => {
    const state = finish(single, singleA("popularNear"));
    expect(state.status).toBe("finished");
    expect(state.orders[0].shippedTick).toBe(390);
    expect(state.timeTick).toBe(470);
  });

  test("one far A ships at 57 seconds and finishes at 65", () => {
    const config = { ...single, placement: "popularFar" } as const;
    const state = finish(config, singleA("popularFar"));
    expect(state.orders[0].shippedTick).toBe(570);
    expect(state.timeTick).toBe(650);
  });

  test("a three-item cart feeds one packer in the fixed order", () => {
    const config: RunConfig = { placement: "popularNear", staffing: "pick2Pack1", transport: "cart3", arrival: "steady", packing: "standard" };
    const state = finish(config, threeA());
    expect(state.orders.map((order) => order.shippedTick)).toEqual([510, 670, 830]);
    expect(state.orders.map((order) => order.pickedTick)).toEqual([100, 140, 180]);
    expect(state.orders.map((order) => order.unloadedTick)).toEqual([290, 290, 290]);
    expect(state.timeTick).toBe(910);
  });

  test("a tooled packing bench finishes one near A forty ticks earlier", () => {
    const state = finish({ ...single, packing: "tooled" }, singleA("popularNear"));
    expect(state.orders[0].shippedTick).toBe(350);
    expect(state.timeTick).toBe(430);
  });

  test("does not mutate the previous tick snapshot", () => {
    const before = createRun(single, singleA("popularNear"));
    const copy = structuredClone(before);
    const after = step(before).state;
    expect(before).toEqual(copy);
    expect(after).not.toBe(before);
    expect(after.timeTick).toBe(1);
  });
});

describe("added experiment conditions", () => {
  test("carries as many orders per trip as the cart allows", () => {
    const five = finish({ ...single, transport: "cart5" }, manyA(5));
    expect(new Set(five.orders.map((order) => order.unloadedTick)).size).toBe(1);

    const pairs = finish({ ...single, transport: "cart2" }, manyA(5));
    expect(new Set(pairs.orders.map((order) => order.unloadedTick)).size).toBe(3);
    expect(pairs.workers[0].distance).toBeGreaterThan(five.workers[0].distance);
  });

  test("runs one trip per picker at the same time", () => {
    let state = createRun({ ...single, staffing: "pick3Pack1", transport: "single" }, createScenario("popularNear", "burst"));
    let concurrent = 0;
    while (state.status === "active" && state.timeTick < 2000) {
      state = step(state).state;
      concurrent = Math.max(concurrent, state.workers.filter((worker) => worker.trip).length);
    }
    expect(concurrent).toBe(3);
  });

  test("keeps 24 orders in every arrival pattern and only moves their timing", () => {
    for (const arrival of ["steady", "burst", "waves"] as const) {
      const orders = createScenario("popularNear", arrival).orders;
      expect(orders).toHaveLength(24);
      expect(orders.map((order) => order.sku)).toEqual(createScenario("popularNear").orders.map((order) => order.sku));
      expect(orders.every((order, index) => index === 0 || order.arrivalTick >= orders[index - 1].arrivalTick)).toBe(true);
      expect(orders.every((order, index) => order.arrivalTick === ARRIVAL_PATTERNS[arrival](index))).toBe(true);
    }
    const arrivedEarly = (arrival: "steady" | "burst" | "waves") => createScenario("popularNear", arrival).orders.filter((order) => order.arrivalTick <= 200).length;
    expect(arrivedEarly("burst")).toBe(18);
    expect(arrivedEarly("steady")).toBe(2);
    expect(new Set(createScenario("popularNear", "waves").orders.map((order) => Math.floor(order.arrivalTick / 900))).size).toBe(3);
  });
});
