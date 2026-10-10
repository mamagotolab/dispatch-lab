import type { SceneFrame } from "./frame";
import { CART_FACING } from "./frame";
import { drawPerson } from "./people";
import { project, type Point } from "./projection";
import { drawBelt, drawCargoBox, drawCart, drawFloorSlab, drawPackingBench, drawShelf, drawTruck, getDockLayout, getEquipmentLayout, type PackingStage } from "./props";

const CANVAS = { width: 1280, height: 900 };
const FLOOR = { from: { x: 0, y: 0 }, to: { x: 13.4, y: 10.4 } };
const SHELF_HEIGHT = 96;
/** 棚本体は通行止めの格子点(pos, pos+x1)をまたぐ位置へ置き、取り出し位置(pos.y+1)を覆わない。 */
const SHELF_ANCHOR = { x: 2.5, y: 2.6 };

/** 画角は床・棚の高さ・トラックを含む固定の外接矩形から決め、倍率で設備を切り落とさない。 */
export function fitTransform(): { scale: number; offsetX: number; offsetY: number; bounds: { left: number; right: number; top: number; bottom: number }; canvas: { width: number; height: number }; topBand: number } {
  const dock = getDockLayout();
  const corners = [
    project(FLOOR.from), project({ x: FLOOR.to.x, y: FLOOR.from.y }), project(FLOOR.to), project({ x: FLOOR.from.x, y: FLOOR.to.y }),
    project({ x: 2, y: 2 }, SHELF_HEIGHT), project({ x: 10, y: 2 }, SHELF_HEIGHT),
    project(dock.truck.to), project({ x: dock.truck.to.x, y: dock.truck.from.y }, 54),
  ];
  const left = Math.min(...corners.map((point) => point.x)); const right = Math.max(...corners.map((point) => point.x));
  const top = Math.min(...corners.map((point) => point.y)); const bottom = Math.max(...corners.map((point) => point.y));
  const topBand = 88; const margin = 28;
  const scale = Math.min((CANVAS.width - margin * 2) / (right - left), (CANVAS.height - topBand - margin) / (bottom - top));
  return {
    scale,
    offsetX: CANVAS.width / 2 - ((left + right) / 2) * scale,
    offsetY: topBand + (CANVAS.height - topBand - margin) / 2 - ((top + bottom) / 2) * scale,
    bounds: { left, right, top, bottom },
    canvas: { ...CANVAS },
    topBand,
  };
}

/** 棚本体が床のどこを占めるか。取り出し位置が内側に入っていないかの検証に使う。 */
export function shelfFootprint(position: Point): { from: Point; to: Point } {
  const bounds = getEquipmentLayout().shelf.bounds;
  const offset = { x: position.x - SHELF_ANCHOR.x, y: position.y - SHELF_ANCHOR.y };
  return { from: { x: bounds.from.x + offset.x, y: bounds.from.y + offset.y }, to: { x: bounds.to.x + offset.x, y: bounds.to.y + offset.y } };
}

function floor(ctx: CanvasRenderingContext2D): void {
  drawFloorSlab(ctx, FLOOR.from, FLOOR.to, "#10273b");
  ctx.strokeStyle = "#1c3c55"; ctx.lineWidth = 0.7;
  for (let x = 0; x <= FLOOR.to.x; x += 1) { const a = project({ x, y: 0 }); const b = project({ x, y: FLOOR.to.y }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let y = 0; y <= FLOOR.to.y; y += 1) { const a = project({ x: 0, y }); const b = project({ x: FLOOR.to.x, y }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  const dock = getDockLayout();
  drawFloorSlab(ctx, { x: dock.truck.from.x - 0.3, y: dock.truck.from.y - 0.3 }, { x: dock.truck.to.x + 0.3, y: dock.truck.to.y + 0.2 }, "#0c1f30");
}

const STAGING_ZONE = { from: { x: 10.3, y: 7.0 }, to: { x: 11.7, y: 7.95 } };

function zone(ctx: CanvasRenderingContext2D, from: Point, to: Point, accent: boolean): void {
  const corners = [project(from), project({ x: to.x, y: from.y }), project(to), project({ x: from.x, y: to.y })];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
  for (const point of corners.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fillStyle = accent ? "#ffcf7222" : "#62e6dc14"; ctx.fill();
  ctx.setLineDash([4, 5]); ctx.lineWidth = 1.4; ctx.strokeStyle = accent ? "#ffcf7299" : "#62e6dc55"; ctx.stroke();
  ctx.restore();
}

function routes(ctx: CanvasRenderingContext2D, paths: Point[][], offset: number): void {
  ctx.save(); ctx.setLineDash([5, 7]); ctx.lineDashOffset = -offset; ctx.strokeStyle = "#62e6dc66"; ctx.lineWidth = 2;
  for (const path of paths) {
    if (path.length < 2) continue;
    ctx.beginPath(); const first = project(path[0]); ctx.moveTo(first.x, first.y);
    for (const point of path.slice(1)) { const next = project(point); ctx.lineTo(next.x, next.y); }
    ctx.stroke();
  }
  ctx.restore();
}

function translated(ctx: CanvasRenderingContext2D, dx: number, dy: number, draw: () => void): void {
  ctx.save(); ctx.translate(34 * (dx - dy), 17 * (dx + dy)); draw(); ctx.restore();
}

function plate(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string): void {
  ctx.save();
  ctx.font = "700 14px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 18;
  ctx.fillStyle = "#07111fdd"; ctx.strokeStyle = `${color}88`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x - width / 2, y - 11, width, 22, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
  ctx.restore();
}

function shelfLabel(ctx: CanvasRenderingContext2D, position: Point, sku: string): void {
  const anchor = project({ x: position.x + 0.5, y: position.y }, SHELF_HEIGHT + 16);
  plate(ctx, anchor.x, anchor.y - 5, `棚${sku}`, "#e9f6ff");
}

export function drawWarehouseScene(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const dock = getDockLayout();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS.height);
  gradient.addColorStop(0, "#07111f"); gradient.addColorStop(1, "#0b1a2a");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);

  const { scale, offsetX, offsetY } = fitTransform();
  ctx.save(); ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  floor(ctx);
  zone(ctx, STAGING_ZONE.from, STAGING_ZONE.to, frame.packingQueue >= 4);
  routes(ctx, frame.routes, frame.motion ? (frame.time % 12) * 2 : 0);
  drawBelt(ctx);

  const objects: { depth: number; draw: () => void }[] = [];
  for (const shelf of frame.shelves) {
    objects.push({ depth: shelf.position.x + shelf.position.y - 1.1, draw: () => translated(ctx, shelf.position.x - SHELF_ANCHOR.x, shelf.position.y - SHELF_ANCHOR.y, () => drawShelf(ctx)) });
  }
  for (const station of dock.stations) {
    const worker = frame.people.find((person) => person.station === station.id);
    if (!worker) continue; // 梱包台は梱包担当がいる分だけ置く
    const stage: PackingStage = worker.pose === "pack-fill" ? "fill" : worker.pose === "pack-seal" ? "seal" : "open";
    objects.push({ depth: 9.35 + station.offset.x + 8.16 + station.offset.y, draw: () => translated(ctx, station.offset.x, station.offset.y, () => drawPackingBench(ctx, stage)) });
  }
  objects.push({ depth: dock.truck.from.x + dock.truck.from.y, draw: () => drawTruck(ctx, frame.truckLoaded, frame.truckStatus === "departed") });
  for (const cart of frame.carts) {
    objects.push({ depth: cart.position.x + cart.position.y, draw: () => drawCart(ctx, cart.position, CART_FACING[cart.facing]) });
  }
  for (const cargo of frame.packages) {
    objects.push({
      depth: cargo.position.x + cargo.position.y + 0.05,
      draw: () => {
        if (cargo.showBox) drawCargoBox(ctx, cargo.position, cargo.baseZ);
        if (!cargo.selected) return;
        const marker = project(cargo.position, cargo.baseZ + 30);
        ctx.strokeStyle = "#ffcf72"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(marker.x, marker.y, 13, 0, Math.PI * 2); ctx.stroke();
      },
    });
  }
  for (const person of frame.people) objects.push({ depth: person.position.x + person.position.y, draw: () => drawPerson(ctx, person) });
  objects.sort((left, right) => left.depth - right.depth).forEach((object) => object.draw());

  for (const shelf of frame.shelves) shelfLabel(ctx, shelf.position, shelf.sku);
  const stagingLabel = project({ x: (STAGING_ZONE.from.x + STAGING_ZONE.to.x) / 2, y: STAGING_ZONE.from.y });
  plate(ctx, stagingLabel.x, stagingLabel.y - 34, `仮置き場 ${frame.packingQueue}件`, frame.packingQueue >= 4 ? "#ffcf72" : "#9fc4d6");
  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#d9f8ff"; ctx.font = "700 20px system-ui";
  ctx.fillText(`倉庫内 ${String(Math.floor(frame.timeTick / 600)).padStart(2, "0")}:${String(Math.floor(frame.timeTick / 10) % 60).padStart(2, "0")}　積み込み ${frame.shipped}/24　梱包待ち ${frame.packingQueue}`, 40, 44);
  ctx.fillStyle = "#8fb3c6"; ctx.font = "600 15px system-ui";
  ctx.fillText(frame.conditionSummary, 40, 70);
}
