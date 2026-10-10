import { describe, expect, test } from "vitest";

import { shortestPath } from "../src/domain/routing";
import { createScenario } from "../src/domain/scenario";

describe("fixed scenarios", () => {
  test("near and far routes match the design", () => {
    const near = createScenario("popularNear");
    const far = createScenario("popularFar");
    const aNear = near.shelves.find((shelf) => shelf.sku === "A")!;
    const aFar = far.shelves.find((shelf) => shelf.sku === "A")!;

    expect(shortestPath(near.depot, aNear.pickup, near.blocked).length - 1).toBe(5);
    expect(shortestPath(far.depot, aFar.pickup, far.blocked).length - 1).toBe(14);
  });

  test("keeps the outbound distance to every shelf fixed", () => {
    const scenario = createScenario("popularNear");
    expect(scenario.shelves.map((shelf) => shortestPath(scenario.depot, shelf.pickup, scenario.blocked).length - 1)).toEqual([14, 11, 8, 11, 8, 5]);
  });

  test("uses the fixed order sequence and returns fresh data", () => {
    const first = createScenario("popularNear");
    const second = createScenario("popularNear");
    expect(first.orders.map((order) => order.sku).join(",")).toBe("A,B,A,C,A,B,A,D,A,B,A,C,A,B,A,E,A,B,A,C,A,B,A,F");
    expect(first.orders.map((order) => order.arrivalTick)).toEqual(Array.from({ length: 24 }, (_, index) => index * 120));
    expect(first).not.toBe(second);
    expect(first.orders).not.toBe(second.orders);
    expect(first.shelves).not.toBe(second.shelves);
  });
});

describe("shortestPath", () => {
  test("includes both endpoints and only orthogonal one-edge steps", () => {
    const path = shortestPath({ x: 0, y: 0 }, { x: 2, y: 2 }, [{ x: 1, y: 0 }]);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path.at(-1)).toEqual({ x: 2, y: 2 });
    for (let index = 1; index < path.length; index += 1) {
      expect(Math.abs(path[index].x - path[index - 1].x) + Math.abs(path[index].y - path[index - 1].y)).toBe(1);
    }
    expect(path).not.toContainEqual({ x: 1, y: 0 });
  });

  test("uses +x, +y, -x, -y as its stable tie-break order", () => {
    expect(shortestPath({ x: 1, y: 1 }, { x: 2, y: 2 }, [])).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ]);
  });

  test("throws an explicit error when the destination is unreachable", () => {
    expect(() => shortestPath({ x: 0, y: 0 }, { x: 1, y: 1 }, [{ x: 0, y: 1 }, { x: 1, y: 0 }])).toThrow(/経路/);
  });
});
