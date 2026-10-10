import { describe, expect, test } from "vitest";

import { createScenario } from "../src/domain/scenario";
import type { Scenario } from "../src/domain/types";
import { validate } from "../src/domain/validate";
import { singleA, threeA } from "./fixtures";

const validConfig = { placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" } as const;

function changeScenario(change: (scenario: Scenario) => void): Scenario {
  const scenario = createScenario("popularNear");
  change(scenario);
  return scenario;
}

describe("validate", () => {
  test("accepts every supported configuration", () => {
    for (const placement of ["popularNear", "popularFar"] as const) {
      for (const staffing of ["pick1Pack1", "pick1Pack2", "pick2Pack1", "pick2Pack2", "pick3Pack1"] as const) {
        for (const transport of ["single", "cart2", "cart3", "cart5"] as const) {
          for (const arrival of ["steady", "burst", "waves"] as const) {
            for (const packing of ["standard", "tooled"] as const) {
              expect(validate({ placement, staffing, transport, arrival, packing }, createScenario(placement, arrival))).toEqual({ ok: true });
            }
          }
        }
      }
    }
  });

  test("rejects an arrival pattern that does not match the orders", () => {
    const result = validate({ ...validConfig, arrival: "waves" }, createScenario("popularNear", "steady"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/到着列/);
  });

  test("rejects unsupported arrival and packing values", () => {
    for (const [key, pattern] of [["arrival", /注文の入り方/], ["packing", /梱包の速さ/]] as const) {
      const result = validate({ ...validConfig, [key]: "other" }, createScenario("popularNear"));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join(" ")).toMatch(pattern);
    }
  });

  test("rejects unsupported configuration values", () => {
    const result = validate({ ...validConfig, placement: "other" }, createScenario("popularNear"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/棚配置/);
  });

  test("keeps small fixtures outside the public 24-order validator", () => {
    expect(singleA("popularNear").orders).toHaveLength(1);
    expect(threeA().orders).toHaveLength(3);
    expect(validate(validConfig, singleA("popularNear")).ok).toBe(false);
    expect(validate(validConfig, threeA()).ok).toBe(false);
  });

  test.each([
    ["wrong order count", (scenario: Scenario) => scenario.orders.pop(), /24件/],
    ["wrong arrival sequence", (scenario: Scenario) => { scenario.orders[2].arrivalTick = 1; }, /到着/],
    ["duplicate shelf sku", (scenario: Scenario) => { scenario.shelves[1].sku = "A"; }, /商品/],
    ["non-positive timing", (scenario: Scenario) => { scenario.timings.picking = 0; }, /時間/],
    ["out-of-range pickup", (scenario: Scenario) => { scenario.shelves[0].pickup = { x: -1, y: 3 }; }, /範囲/],
    ["unreachable shelf", (scenario: Scenario) => { scenario.blocked.push({ x: 1, y: 3 }, { x: 2, y: 4 }, { x: 3, y: 3 }); }, /経路/],
  ] as const)("rejects %s", (_name, change, message) => {
    const result = validate(validConfig, changeScenario(change));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(message);
  });
});
