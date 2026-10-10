import { project, type Point } from "./projection";

export interface WorldBox { from: Point; to: Point; baseZ: number; height: number; }
interface ColoredBox extends WorldBox { top: string; front: string; side: string; }
const shelfBounds = { from: { x: 2, y: 2 }, to: { x: 4, y: 3.2 } };
const shelfProducts: WorldBox[] = Array.from({ length: 9 }, (_, index) => { const column = index % 3; const level = Math.floor(index / 3); return { from: { x: 2.3 + column * 0.52, y: 2.55 }, to: { x: 2.68 + column * 0.52, y: 2.98 }, baseZ: 24 + level * 25, height: 14 }; });
const worktopZ = 39;
const packingItems: WorldBox[] = [{ from: { x: 9.72, y: 8.48 }, to: { x: 10.42, y: 8.95 }, baseZ: worktopZ, height: 17 }, { from: { x: 10.6, y: 8.52 }, to: { x: 10.85, y: 8.76 }, baseZ: worktopZ, height: 6 }];
const benchBounds = { from: { x: 9.35, y: 8.16 }, to: { x: 11.02, y: 9.25 } };
const dock = { beltY: 9.62, beltFromX: 9.3, beltToX: 13.35, beltZ: 14, stations: [{ id: 1, offset: { x: 0, y: -0.28 } }, { id: 2, offset: { x: 2, y: -0.28 } }], truck: { from: { x: 13.5, y: 8.95 }, to: { x: 15.25, y: 10.2 } } } as const;
export function getDockLayout() { return dock; }
export function getEquipmentLayout() { return { shelf: { bounds: shelfBounds, products: shelfProducts }, packing: { bounds: benchBounds, worktopZ, items: packingItems }, dock } as const; }
export type CartFacing = "nw" | "se" | "sw" | "ne";
export type PackingStage = "open" | "fill" | "seal";
export function getPackingVisual(stage: PackingStage) {
  return { boxOpen: stage !== "seal", productVisible: stage === "fill", tapeVisible: stage === "seal" } as const;
}

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, stroke = "#07111f88"): void { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke !== "transparent") { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }
function prism(ctx: CanvasRenderingContext2D, box: ColoredBox): void { const { from, to, baseZ, height } = box; const topZ = baseZ + height; polygon(ctx, [project({ x: from.x, y: to.y }, topZ), project(to, topZ), project(to, baseZ), project({ x: from.x, y: to.y }, baseZ)], box.front); polygon(ctx, [project({ x: to.x, y: from.y }, topZ), project(to, topZ), project(to, baseZ), project({ x: to.x, y: from.y }, baseZ)], box.side); polygon(ctx, [project(from, topZ), project({ x: to.x, y: from.y }, topZ), project(to, topZ), project({ x: from.x, y: to.y }, topZ)], box.top); }
function shadow(ctx: CanvasRenderingContext2D, from: Point, to: Point): void { polygon(ctx, [project(from), project({ x: to.x, y: from.y }), project(to), project({ x: from.x, y: to.y })], "#02081355", "transparent"); }

export function drawShelf(ctx: CanvasRenderingContext2D): void {
  shadow(ctx, { x: 1.9, y: 2.05 }, { x: 4.25, y: 3.45 });
  const steel = { top: "#b9d4dc", front: "#5f8192", side: "#45677c" };
  prism(ctx, { from: { x: 2.02, y: 2.92 }, to: { x: 3.98, y: 3.12 }, baseZ: 0, height: 89, ...steel });
  for (const x of [2.02, 3.82]) prism(ctx, { from: { x, y: 2.22 }, to: { x: x + 0.16, y: 3.12 }, baseZ: 0, height: 92, ...steel });
  for (const z of [20, 45, 70, 89]) prism(ctx, { from: { x: 2.05, y: 2.18 }, to: { x: 3.98, y: 3.12 }, baseZ: z, height: 4, ...steel });
  const colors = [{ top: "#a5fff0", front: "#42b9b0", side: "#287c7c" }, { top: "#ffe0a0", front: "#d99b45", side: "#a46e31" }, { top: "#ffd0dc", front: "#cb7389", side: "#8f4b64" }];
  shelfProducts.forEach((product, index) => prism(ctx, { ...product, ...colors[index % colors.length] }));
}

/** 台車の向き。進行方向へ荷台を伸ばし、取っ手は後ろ側（作業者側）に置く。 */
const CART_BACK: Record<CartFacing, Point> = { se: { x: -0.62, y: 0 }, nw: { x: 0.62, y: 0 }, sw: { x: 0, y: -0.62 }, ne: { x: 0, y: 0.62 } };
function cartHalf(facing: CartFacing): Point {
  return facing === "se" || facing === "nw" ? { x: 0.55, y: 0.38 } : { x: 0.38, y: 0.55 };
}

function cartHandle(position: Point, facing: CartFacing): WorldBox {
  const back = CART_BACK[facing];
  return { from: { x: position.x + back.x - 0.11, y: position.y + back.y - 0.11 }, to: { x: position.x + back.x + 0.11, y: position.y + back.y + 0.11 }, baseZ: 32, height: 4 };
}

export function getCartHandleScreen(position: Point, facing: CartFacing): Point {
  const handle = cartHandle(position, facing);
  return project({ x: (handle.from.x + handle.to.x) / 2, y: (handle.from.y + handle.to.y) / 2 }, handle.baseZ + handle.height);
}

export function drawCart(ctx: CanvasRenderingContext2D, position: Point, facing: CartFacing): void {
  const half = cartHalf(facing);
  const from = { x: position.x - half.x, y: position.y - half.y };
  const to = { x: position.x + half.x, y: position.y + half.y };
  shadow(ctx, { x: from.x - 0.06, y: from.y }, { x: to.x + 0.06, y: to.y + 0.1 });
  const metal = { top: "#b8d6de", front: "#587b8d", side: "#3d6175" };
  const wheels = facing === "se" || facing === "nw"
    ? [{ x: from.x + 0.08, y: to.y - 0.06 }, { x: to.x - 0.2, y: to.y - 0.06 }]
    : [{ x: from.x + 0.04, y: from.y + 0.12 }, { x: from.x + 0.04, y: to.y - 0.22 }];
  for (const wheel of wheels) prism(ctx, { from: wheel, to: { x: wheel.x + 0.12, y: wheel.y + 0.12 }, baseZ: 0, height: 9, top: "#263746", front: "#07111f", side: "#111e2a" });
  prism(ctx, { from, to, baseZ: 9, height: 8, ...metal });
  const back = CART_BACK[facing];
  const post = { x: position.x + back.x * 0.82, y: position.y + back.y * 0.82 };
  prism(ctx, { from: { x: post.x - 0.08, y: post.y - 0.08 }, to: { x: post.x + 0.08, y: post.y + 0.08 }, baseZ: 13, height: 19, ...metal });
  prism(ctx, { ...cartHandle(position, facing), top: "#9ff0e6", front: "#3aaea8", side: "#2b8686" });
}

export function drawPackingBench(ctx: CanvasRenderingContext2D, stage: PackingStage): void {
  const visual = getPackingVisual(stage);
  const metal = { top: "#d5e8e9", front: "#668b99", side: "#4c6f7e" };
  shadow(ctx, { x: 9.28, y: 8.05 }, { x: 11.12, y: 9.45 });
  for (const x of [9.45, 10.7]) prism(ctx, { from: { x, y: 8.25 }, to: { x: x + 0.18, y: 9.22 }, baseZ: 0, height: 37, ...metal });
  prism(ctx, { from: benchBounds.from, to: benchBounds.to, baseZ: 34, height: 5, ...metal });
  const box = packingItems[0];
  prism(ctx, { ...box, height: visual.boxOpen ? 8 : 17, top: visual.boxOpen ? "#7e542c" : "#ffe2a0", front: "#d99d4f", side: "#aa7135" });
  if (visual.boxOpen) {
    prism(ctx, { from: { x: box.from.x - 0.12, y: box.from.y }, to: { x: box.from.x + 0.02, y: box.to.y }, baseZ: 47, height: 2, top: "#ffe2a0", front: "#d99d4f", side: "#aa7135" });
    prism(ctx, { from: { x: box.to.x - 0.02, y: box.from.y }, to: { x: box.to.x + 0.12, y: box.to.y }, baseZ: 47, height: 2, top: "#ffe2a0", front: "#d99d4f", side: "#aa7135" });
  }
  prism(ctx, { ...packingItems[1], top: "#84ede1", front: "#36a89f", side: "#287a79" });
  if (visual.productVisible) prism(ctx, { from: { x: 9.92, y: 8.62 }, to: { x: 10.2, y: 8.83 }, baseZ: 47, height: 7, top: "#fff1ba", front: "#e1aa51", side: "#ad7534" });
  if (visual.tapeVisible) prism(ctx, { from: { x: 10.02, y: 8.47 }, to: { x: 10.12, y: 8.96 }, baseZ: 56, height: 1, top: "#69e3d6", front: "#36a89f", side: "#287a79" });
  prism(ctx, { from: { x: 10.82, y: 8.25 }, to: { x: 10.94, y: 8.4 }, baseZ: 39, height: 43, ...metal });
  prism(ctx, { from: { x: 10.22, y: 8.25 }, to: { x: 10.94, y: 8.4 }, baseZ: 79, height: 4, top: "#74eee1", front: "#3aaea8", side: "#287b7b" });
}

export function drawCargoBox(ctx: CanvasRenderingContext2D, position: Point, baseZ = 38): void {
  prism(ctx, { from: { x: position.x - 0.22, y: position.y - 0.16 }, to: { x: position.x + 0.22, y: position.y + 0.16 }, baseZ, height: 13, top: "#fff0b3", front: "#dda14a", side: "#a96d2f" });
}

export function drawFloorSlab(ctx: CanvasRenderingContext2D, from: Point, to: Point, fill: string): void {
  polygon(ctx, [project(from), project({ x: to.x, y: from.y }), project(to), project({ x: from.x, y: to.y })], fill, "transparent");
}

export function drawBelt(ctx: CanvasRenderingContext2D): void {
  const half = 0.23;
  shadow(ctx, { x: dock.beltFromX, y: dock.beltY - half }, { x: dock.beltToX, y: dock.beltY + half + 0.1 });
  prism(ctx, { from: { x: dock.beltFromX, y: dock.beltY - half }, to: { x: dock.beltToX, y: dock.beltY + half }, baseZ: 0, height: dock.beltZ, top: "#48788c", front: "#2c5264", side: "#22414f" });
  ctx.save();
  ctx.strokeStyle = "#8fc4cf88"; ctx.lineWidth = 1.4;
  for (let x = dock.beltFromX + 0.2; x < dock.beltToX; x += 0.28) {
    const a = project({ x, y: dock.beltY - half }, dock.beltZ); const b = project({ x, y: dock.beltY + half }, dock.beltZ);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  ctx.restore();
}

export function drawTruck(ctx: CanvasRenderingContext2D, loadedBoxes: number, departed: boolean): void {
  ctx.save();
  if (departed) { ctx.globalAlpha = 0.4; ctx.translate(34 * 1.6, 17 * 1.6); }
  const { from, to } = dock.truck;
  const cabFrom = to.x - 0.6;
  const body = { top: "#e4f3f5", front: "#9cbdc6", side: "#7a9dab" };
  const cab = { top: "#bcd8de", front: "#6f95a3", side: "#587d8c" };
  const chassis = { top: "#4a6674", front: "#2b4553", side: "#223a47" };
  const tyre = { top: "#7a8fa0", front: "#1b2a38", side: "#233440" };
  shadow(ctx, { x: from.x, y: from.y }, { x: to.x, y: to.y + 0.12 });
  for (const wheel of [{ x: from.x + 0.28, y: from.y - 0.1 }, { x: cabFrom - 0.62, y: from.y - 0.1 }, { x: from.x + 0.28, y: to.y - 0.02 }, { x: cabFrom - 0.62, y: to.y - 0.02 }]) {
    prism(ctx, { from: wheel, to: { x: wheel.x + 0.36, y: wheel.y + 0.12 }, baseZ: 0, height: 15, ...tyre });
  }
  prism(ctx, { from: { x: from.x, y: from.y + 0.05 }, to: { x: to.x, y: to.y - 0.05 }, baseZ: 13, height: 6, ...chassis });
  // 荷台は上面を開けたまま描き、積み込み済みの箱が見えるようにする。
  prism(ctx, { from, to: { x: from.x + 0.1, y: to.y }, baseZ: 19, height: 30, ...body });
  prism(ctx, { from: { x: from.x, y: from.y }, to: { x: cabFrom - 0.05, y: from.y + 0.1 }, baseZ: 19, height: 30, ...body });
  for (let index = 0; index < Math.min(loadedBoxes, 4); index += 1) {
    const column = index % 2; const level = Math.floor(index / 2);
    prism(ctx, { from: { x: from.x + 0.22 + column * 0.42, y: from.y + 0.32 }, to: { x: from.x + 0.56 + column * 0.42, y: from.y + 0.78 }, baseZ: 19 + level * 14, height: 13, top: "#fff0b3", front: "#dda14a", side: "#a96d2f" });
  }
  prism(ctx, { from: { x: from.x, y: to.y - 0.1 }, to: { x: cabFrom - 0.05, y: to.y }, baseZ: 19, height: 30, ...body });
  prism(ctx, { from: { x: cabFrom, y: from.y + 0.02 }, to: { x: to.x, y: to.y - 0.02 }, baseZ: 19, height: 24, ...cab });
  prism(ctx, { from: { x: cabFrom + 0.42, y: from.y + 0.14 }, to: { x: cabFrom + 0.56, y: to.y - 0.14 }, baseZ: 26, height: 13, top: "#9ff0e6", front: "#3aaea8", side: "#2b8686" });
  prism(ctx, { from: { x: cabFrom + 0.46, y: to.y - 0.16 }, to: { x: to.x, y: to.y - 0.04 }, baseZ: 19, height: 5, top: "#ffe9b0", front: "#e0b455", side: "#ab8637" });
  ctx.restore();
}
