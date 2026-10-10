import { describe, expect, test } from "vitest";

import { createScenario } from "../src/domain/scenario";
import { createRun } from "../src/domain/simulation";
import { buildSceneFrame, cartSpot, CART_FACING, handSpot, type ViewState } from "../src/render/frame";
import { getPersonHandScreen, type Facing, type PersonInput } from "../src/render/people";
import { project } from "../src/render/projection";
import { getCartHandleScreen } from "../src/render/props";
import { getDockLayout } from "../src/render/props";
import { fitTransform, shelfFootprint } from "../src/render/warehouse-scene";
import type { Placement } from "../src/domain/types";

const view: ViewState = { showRoutes: true, reducedMotion: false, selectedOrderId: null };

test("places a moving worker halfway along the active edge", () => {
  const state = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, createScenario("popularNear"));
  state.timeTick = 105;
  state.workers[0].position = { x: 11, y: 8 };
  state.workers[0].action = { type: "moving", path: [{ x: 11, y: 8 }, { x: 10, y: 8 }], startTick: 100, endTick: 110, purpose: "toShelf" };
  const frame = buildSceneFrame(state, 0, view);
  expect(frame.people[0].position).toEqual({ x: 10.5, y: 8 });
  expect(frame.people[0].pose).toBe("walk");
  expect(frame.people[0].facing).toBe("nw");
});

test("reduced motion keeps the worker on a completed node", () => {
  const state = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, createScenario("popularNear"));
  state.timeTick = 105;
  state.workers[0].action = { type: "moving", path: [{ x: 11, y: 8 }, { x: 10, y: 8 }], startTick: 100, endTick: 110, purpose: "toShelf" };
  const frame = buildSceneFrame(state, 0, { ...view, reducedMotion: true });
  expect(frame.people[0].position).toEqual({ x: 11, y: 8 });
});

test("derives work poses from the domain action", () => {
  const state = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, createScenario("popularNear"));
  state.workers[0].action = { type: "picking", orderId: "ID01", startTick: 50, endTick: 90 };
  state.workers[1].action = { type: "packing", orderId: "ID01", startTick: 50, endTick: 210 };
  const frame = buildSceneFrame(state, 0, view);
  expect(frame.people[0].pose).toBe("pick");
  expect(frame.people[1].pose).toMatch(/^pack-/);
});

test.each(["popularNear", "popularFar"] as Placement[])("keeps every pickup position clear of the shelf body (%s)", (placement) => {
  for (const shelf of createScenario(placement).shelves) {
    const body = shelfFootprint(shelf.position);
    const inside = shelf.pickup.x >= body.from.x && shelf.pickup.x <= body.to.x && shelf.pickup.y >= body.from.y && shelf.pickup.y <= body.to.y;
    expect(inside).toBe(false);
  }
});

test("moves a conveyed package along the belt without repeating the packing box", () => {
  const dock = getDockLayout();
  const state = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, createScenario("popularNear"));
  state.timeTick = 500;
  state.orders[0].state = "conveying"; state.orders[0].workerId = "W2"; state.orders[0].conveyEndTick = 540;
  state.orders[1].state = "packing"; state.orders[1].workerId = "W3";
  const early = buildSceneFrame(state, 0, view).packages.find((item) => item.orderId === state.orders[0].id)!;
  state.timeTick = 530;
  const late = buildSceneFrame(state, 0, view).packages.find((item) => item.orderId === state.orders[0].id)!;
  expect(early.position.y).toBeCloseTo(dock.beltY);
  expect(early.baseZ).toBe(dock.beltZ);
  expect(late.position.x).toBeGreaterThan(early.position.x);
  expect(late.position.x).toBeLessThanOrEqual(dock.beltToX);
  expect(buildSceneFrame(state, 0, view).packages.find((item) => item.orderId === state.orders[1].id)!.showBox).toBe(false);
});

test("stages the packing queue on the floor and pushes the cart ahead of its worker", () => {
  const scenario = createScenario("popularNear");
  const state = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "cart3", arrival: "steady", packing: "standard" }, scenario);
  state.timeTick = 300;
  state.orders[0].state = "packingQueue"; state.orders[0].unloadedTick = 200;
  state.orders[1].state = "packingQueue"; state.orders[1].unloadedTick = 210;
  state.workers[0].position = { x: 7, y: 6 };
  state.workers[0].trip = { orderIds: [state.orders[2].id], stops: [{ shelfId: "S6", pickup: { x: 8, y: 6 }, orderIds: [state.orders[2].id], nextOrderIndex: 0 }], stopIndex: 0, phase: "moving" };
  state.workers[0].action = { type: "moving", path: [{ x: 7, y: 6 }, { x: 8, y: 6 }], startTick: 295, endTick: 307, purpose: "toShelf" };
  const frame = buildSceneFrame(state, 0, view);
  const staged = frame.packages.filter((item) => item.baseZ === 0);
  expect(staged).toHaveLength(2);
  expect(new Set(staged.map((item) => `${item.position.x},${item.position.y}`)).size).toBe(2);
  const person = frame.people[0]; const cart = frame.carts[0];
  expect(cart.position.x).toBeGreaterThan(person.position.x);
  expect(Math.hypot(cart.position.x - person.position.x, cart.position.y - person.position.y)).toBeLessThan(1.2);
});

test("fits the whole scene into the canvas below the status line", () => {
  const { scale, offsetX, offsetY, bounds, canvas, topBand } = fitTransform();
  expect(scale).toBeGreaterThan(1);
  expect(bounds.left * scale + offsetX).toBeGreaterThanOrEqual(0);
  expect(bounds.right * scale + offsetX).toBeLessThanOrEqual(canvas.width);
  expect(bounds.top * scale + offsetY).toBeGreaterThanOrEqual(topBand);
  expect(bounds.bottom * scale + offsetY).toBeLessThanOrEqual(canvas.height);
});

describe("carrying by cart or by hand", () => {
  const walker = (facing: Facing, pose: PersonInput["pose"]): PersonInput => ({ position: { x: 6, y: 6 }, facing, pose, walkPhase: 0, workerId: "W1" });

  test.each(["se", "sw", "ne", "nw"] as Facing[])("puts the pushing hand on the cart handle facing %s", (facing) => {
    const person = walker(facing, "push");
    const hand = getPersonHandScreen(person);
    const handle = getCartHandleScreen(cartSpot(person.position, facing), CART_FACING[facing]);
    expect(Math.hypot(hand.x - handle.x, hand.y - handle.y)).toBeLessThan(16);
  });

  test.each(["se", "sw", "ne", "nw"] as Facing[])("puts a hand-carried box in the hand facing %s", (facing) => {
    const person = walker(facing, "carry");
    const hand = getPersonHandScreen(person);
    const box = project(handSpot(person.position, facing), 39 + 6.5);
    expect(Math.hypot(hand.x - box.x, hand.y - box.y)).toBeLessThan(6);
  });

  test.each(["cart2", "cart3", "cart5"] as const)("draws a cart and pushes it for %s", (transport) => {
    const scenario = createScenario("popularNear");
    const trip = { orderIds: ["ID01"], stops: [{ shelfId: "S6", pickup: { x: 8, y: 6 }, orderIds: ["ID01"], nextOrderIndex: 1 }], stopIndex: 0, phase: "returning" as const };
    const moving = { type: "moving" as const, path: [{ x: 8, y: 6 }, { x: 9, y: 6 }], startTick: 100, endTick: 112, purpose: "return" as const };

    const cartRun = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport, arrival: "steady", packing: "standard" }, scenario);
    cartRun.timeTick = 105; cartRun.workers[0].trip = structuredClone(trip); cartRun.workers[0].action = structuredClone(moving);
    cartRun.orders[0].state = "picked"; cartRun.orders[0].workerId = "W1";
    const cartFrame = buildSceneFrame(cartRun, 0, view);
    expect(cartFrame.people[0].pose).toBe("push");
    expect(cartFrame.carts).toHaveLength(1);
    expect(cartFrame.packages[0].baseZ).toBe(17);
  });

  test("carries by hand when no cart is used", () => {
    const scenario = createScenario("popularNear");
    const trip = { orderIds: ["ID01"], stops: [{ shelfId: "S6", pickup: { x: 8, y: 6 }, orderIds: ["ID01"], nextOrderIndex: 1 }], stopIndex: 0, phase: "returning" as const };
    const moving = { type: "moving" as const, path: [{ x: 8, y: 6 }, { x: 9, y: 6 }], startTick: 100, endTick: 112, purpose: "return" as const };
    const handRun = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, scenario);
    handRun.timeTick = 105; handRun.workers[0].trip = structuredClone(trip); handRun.workers[0].action = structuredClone(moving);
    handRun.orders[0].state = "picked"; handRun.orders[0].workerId = "W1";
    const handFrame = buildSceneFrame(handRun, 0, view);
    expect(handFrame.people[0].pose).toBe("carry");
    expect(handFrame.carts).toHaveLength(0);
    expect(handFrame.packages[0].baseZ).toBe(39);
  });
});
