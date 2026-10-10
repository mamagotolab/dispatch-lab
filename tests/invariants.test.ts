import { expect, test } from "vitest";

import { CART_CAPACITY, createScenario, STAFFING_PLAN } from "../src/domain/scenario";
import { createRun, step } from "../src/domain/simulation";
import type { RunConfig } from "../src/domain/types";

const base: RunConfig = { placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" };

/** 8通りの基準条件に、追加した軸を1つずつ変えた条件を足した代表集合。 */
const configurations: RunConfig[] = [
  ...(["popularNear", "popularFar"] as const).flatMap((placement) =>
    (["pick2Pack1", "pick1Pack2"] as const).flatMap((staffing) =>
      (["single", "cart3"] as const).map((transport): RunConfig => ({ ...base, placement, staffing, transport })))),
  ...(["pick1Pack1", "pick2Pack2", "pick3Pack1"] as const).map((staffing): RunConfig => ({ ...base, staffing, transport: "cart3" })),
  ...(["burst", "waves"] as const).map((arrival): RunConfig => ({ ...base, staffing: "pick2Pack1", transport: "cart3", arrival })),
  ...(["cart2", "cart5"] as const).map((transport): RunConfig => ({ ...base, transport })),
  { ...base, transport: "cart3", packing: "tooled" },
];

test("every representative configuration finishes without losing or duplicating orders", () => {
  const ranks = ["scheduled", "waiting", "assigned", "picked", "packingQueue", "packing", "conveying", "shipped"];
  for (const config of configurations) {
    const plan = STAFFING_PLAN[config.staffing];
    let state = createRun(config, createScenario(config.placement, config.arrival));
    expect(state.workers.filter((worker) => worker.role === "picker")).toHaveLength(plan.pickers);
    expect(state.workers.filter((worker) => worker.role === "packer")).toHaveLength(plan.packers);
    expect(new Set(state.workers.map((worker) => worker.id)).size).toBe(plan.pickers + plan.packers);
    let previousRanks = new Map(state.orders.map((order) => [order.id, ranks.indexOf(order.state)]));
    while (state.status === "active" && state.timeTick < 100000) {
      state = step(state).state;
      if (state.orders.length !== 24 || new Set(state.orders.map((order) => order.id)).size !== 24) throw new Error("注文の消失または重複");
      if (!state.workers.every((worker) => !worker.trip || worker.trip.orderIds.length <= CART_CAPACITY[config.transport])) throw new Error("便の上限超過");
      const owned = state.workers.flatMap((worker) => worker.trip?.orderIds ?? []);
      if (new Set(owned).size !== owned.length) throw new Error("注文の二重所有");
      if (state.orders.filter((order) => order.state === "packing").length > plan.packers) throw new Error("梱包担当より多い同時梱包");
      for (const order of state.orders) {
        const rank = ranks.indexOf(order.state);
        if (rank < previousRanks.get(order.id)!) throw new Error("注文状態の逆行");
        previousRanks.set(order.id, rank);
        if (order.state === "packing" && order.unloadedTick === undefined) throw new Error("受渡前の梱包開始");
      }
    }
    expect(state.status, JSON.stringify(config)).toBe("finished");
    expect(state.orders.every((order) => order.state === "shipped")).toBe(true);
  }
}, 60_000);
