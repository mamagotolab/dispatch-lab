import { describe, expect, test } from "vitest";

import { buildPersonShape, getPersonHandScreen } from "../src/render/people";
import { buildProbeFrame, type ProbeScene } from "../src/render/probe";
import { project } from "../src/render/projection";
import { getCartHandleScreen, getEquipmentLayout, getPackingVisual } from "../src/render/props";

describe("person shape", () => {
  test("keeps the designed width and height of torso and legs", () => {
    const shape = buildPersonShape({ facing: "se", pose: "idle", walkPhase: 0 });
    expect(shape.parts.find((part) => part.id === "torso")).toMatchObject({ width: 8, height: 7 });
    expect(shape.parts.find((part) => part.id === "left-leg")).toMatchObject({ width: 2, height: 5 });
    expect(shape.parts.find((part) => part.id === "right-leg")).toMatchObject({ width: 2, height: 5 });
  });

  test("has six distinct walking silhouettes", () => {
    const silhouettes = Array.from({ length: 6 }, (_, frame) =>
      JSON.stringify(buildPersonShape({ facing: "se", pose: "walk", walkPhase: frame / 6 }).parts),
    );
    expect(new Set(silhouettes).size).toBe(6);
  });

  test.each(["se", "sw", "ne", "nw"] as const)("exposes a hand anchor when facing %s", (facing) => {
    const shape = buildPersonShape({ facing, pose: "push", walkPhase: 0 });
    expect(Number.isFinite(shape.handAnchor.x)).toBe(true);
    expect(Number.isFinite(shape.handAnchor.y)).toBe(true);
  });

  test("uses distinct silhouettes for opening, filling, and sealing a box", () => {
    const silhouettes = ["pack-open", "pack-fill", "pack-seal"].map((pose) =>
      JSON.stringify(buildPersonShape({ facing: "nw", pose: pose as "pack-open" | "pack-fill" | "pack-seal", walkPhase: 0 }).parts),
    );
    expect(new Set(silhouettes).size).toBe(3);
  });
});

describe("equipment geometry", () => {
  test("keeps products inside the shelf volume", () => {
    const layout = getEquipmentLayout();
    for (const product of layout.shelf.products) {
      expect(product.from.x).toBeGreaterThanOrEqual(layout.shelf.bounds.from.x);
      expect(product.to.x).toBeLessThanOrEqual(layout.shelf.bounds.to.x);
      expect(product.from.y).toBeGreaterThanOrEqual(layout.shelf.bounds.from.y);
      expect(product.to.y).toBeLessThanOrEqual(layout.shelf.bounds.to.y);
      expect(product.baseZ).toBeGreaterThan(0);
    }
  });

  test("places packing items on the worktop", () => {
    const layout = getEquipmentLayout();
    for (const item of layout.packing.items) {
      expect(item.baseZ).toBe(layout.packing.worktopZ);
    }
  });

  test("changes the box and product for every packing stage", () => {
    expect(new Set(["open", "fill", "seal"].map((stage) => JSON.stringify(getPackingVisual(stage as "open" | "fill" | "seal")))).size).toBe(3);
    expect(getPackingVisual("open")).toMatchObject({ boxOpen: true, productVisible: false, tapeVisible: false });
    expect(getPackingVisual("fill")).toMatchObject({ boxOpen: true, productVisible: true, tapeVisible: false });
    expect(getPackingVisual("seal")).toMatchObject({ boxOpen: false, productVisible: false, tapeVisible: true });
  });
});

describe("probe timeline", () => {
  test.each(["hand", "cart", "packing"] as ProbeScene[])("is continuous throughout the %s scene", (scene) => {
    let previous = buildProbeFrame(scene, 0);
    for (let step = 1; step <= 1000; step += 1) {
      const current = buildProbeFrame(scene, step / 1000);
      expect(Math.hypot(current.person.position.x - previous.person.position.x, current.person.position.y - previous.person.position.y)).toBeLessThan(0.08);
      if (current.cart && previous.cart) {
        expect(Math.hypot(current.cart.x - previous.cart.x, current.cart.y - previous.cart.y)).toBeLessThan(0.08);
      }
      previous = current;
    }
  });

  test("moves the cart with the worker while pushing", () => {
    for (const progress of [0.18, 0.28, 0.78, 0.9]) {
      const frame = buildProbeFrame("cart", progress);
      expect(frame.person.pose).toBe("push");
      expect(frame.cart).not.toBeNull();
      expect(Math.hypot(frame.person.position.x - frame.cart!.x, frame.person.position.y - frame.cart!.y)).toBeLessThan(1.8);
    }
  });

  test("keeps the pushing hand on the cart handle", () => {
    for (const progress of [0.05, 0.18, 0.3, 0.68, 0.82, 0.96]) {
      const frame = buildProbeFrame("cart", progress);
      const hand = getPersonHandScreen(frame.person);
      const handle = getCartHandleScreen(frame.cart!, frame.cartFacing);
      expect(Math.hypot(hand.x - handle.x, hand.y - handle.y)).toBeLessThan(16);
    }
  });

  test.each([[0.12, 0.2], [0.72, 0.8]])("keeps the worker behind the moving cart from %s to %s", (fromProgress, toProgress) => {
    const from = buildProbeFrame("cart", fromProgress);
    const to = buildProbeFrame("cart", toProgress);
    const movement = { x: to.cart!.x - from.cart!.x, y: to.cart!.y - from.cart!.y };
    const workerOffset = { x: from.person.position.x - from.cart!.x, y: from.person.position.y - from.cart!.y };
    expect(workerOffset.x * movement.x + workerOffset.y * movement.y).toBeLessThan(0);
  });

  test("keeps the worker outside the shelf while handling the cart", () => {
    const shelf = getEquipmentLayout().shelf.bounds;
    for (const progress of [0.36, 0.46, 0.5, 0.6]) {
      const { position } = buildProbeFrame("cart", progress).person;
      const insideShelf = position.x >= shelf.from.x && position.x <= shelf.to.x && position.y >= shelf.from.y && position.y <= shelf.to.y;
      expect(insideShelf).toBe(false);
    }
  });

  test("gives the moving package exactly one owner", () => {
    const handOwners = [0.1, 0.38, 0.56, 0.9].map((progress) => buildProbeFrame("hand", progress).cargo.owner);
    expect(handOwners).toEqual(["shelf", "hand", "hand", "handoff"]);

    const cartOwners = [0.1, 0.5, 0.7, 0.9].map((progress) => buildProbeFrame("cart", progress).cargo.owner);
    expect(cartOwners).toEqual(["shelf", "hand", "cart", "cart"]);
  });

  test.each(["hand", "cart"] as ProbeScene[])("keeps the visible package continuous throughout %s transfers", (scene) => {
    let previous = buildProbeFrame(scene, 0);
    let visibleFrames = 0;
    for (let step = 1; step <= 1000; step += 1) {
      const current = buildProbeFrame(scene, step / 1000);
      if (current.cargo.position && previous.cargo.position) {
        visibleFrames += 1;
        expect(Math.hypot(current.cargo.position.x - previous.cargo.position.x, current.cargo.position.y - previous.cargo.position.y)).toBeLessThan(0.08);
        expect(Math.abs(current.cargo.baseZ - previous.cargo.baseZ)).toBeLessThan(1);
      }
      previous = current;
    }
    expect(visibleFrames).toBeGreaterThan(300);
  });

  test("keeps carried cargo at the worker's hand", () => {
    for (const progress of [0.5, 0.64, 0.78]) {
      const frame = buildProbeFrame("hand", progress);
      const hand = getPersonHandScreen(frame.person);
      const box = project(frame.cargo.position!, frame.cargo.baseZ + 6.5);
      expect(Math.hypot(hand.x - box.x, hand.y - box.y)).toBeLessThan(4);
    }
  });

  test("keeps the packing worker at the workbench", () => {
    const positions = [0, 0.25, 0.5, 0.75, 1].map((progress) => buildProbeFrame("packing", progress).person.position);
    expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(1);
    expect(new Set([0.1, 0.4, 0.7].map((progress) => buildProbeFrame("packing", progress).person.pose)).size).toBe(3);
  });

  test("keeps the parked cart clear of the hand-carry route", () => {
    for (let step = 0; step <= 100; step += 1) {
      const frame = buildProbeFrame("hand", step / 100);
      expect(Math.hypot(frame.person.position.x - frame.cart!.x, frame.person.position.y - frame.cart!.y)).toBeGreaterThan(1.2);
    }
  });
});
