import { drawPerson } from "./people";
import { project, type Point } from "./projection";
import type { ProbeFrame } from "./probe";
import { drawCargoBox, drawCart, drawPackingBench, drawShelf, type PackingStage } from "./props";

function floorPolygon(ctx: CanvasRenderingContext2D): void {
  const corners = [project({ x: 0, y: 0 }), project({ x: 12, y: 0 }), project({ x: 12, y: 10 }), project({ x: 0, y: 10 })];
  ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
  for (const point of corners.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath(); ctx.fillStyle = "#10273b"; ctx.fill();
  ctx.strokeStyle = "#1c3c55"; ctx.lineWidth = 0.7;
  for (let x = 0; x <= 12; x += 1) { const a = project({ x, y: 0 }); const b = project({ x, y: 10 }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (let y = 0; y <= 10; y += 1) { const a = project({ x: 0, y }); const b = project({ x: 12, y }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
}

function drawRoute(ctx: CanvasRenderingContext2D, frame: ProbeFrame): void {
  const paths: Record<ProbeFrame["scene"], Point[]> = {
    hand: [{ x: 7.4, y: 7.2 }, { x: 3.9, y: 3.6 }, { x: 8.5, y: 7.9 }],
    cart: [{ x: 7, y: 7.1 }, { x: 3.35, y: 4 }, { x: 8.4, y: 7.8 }],
    packing: [{ x: 10.15, y: 9.55 }, { x: 10.15, y: 9.55 }],
  };
  const path = paths[frame.scene];
  ctx.save(); ctx.setLineDash([5, 7]); ctx.lineWidth = 2; ctx.strokeStyle = "#62e6dc55"; ctx.beginPath();
  ctx.moveTo(project(path[0]).x, project(path[0]).y);
  for (const point of path.slice(1)) { const p = project(point); ctx.lineTo(p.x, p.y); }
  ctx.stroke(); ctx.restore();
}

function drawWorker(ctx: CanvasRenderingContext2D, frame: ProbeFrame): void {
  drawPerson(ctx, frame.person);
}

export function drawScene(ctx: CanvasRenderingContext2D, frame: ProbeFrame): void {
  ctx.clearRect(0, 0, 1280, 900);
  const gradient = ctx.createLinearGradient(0, 0, 0, 900);
  gradient.addColorStop(0, "#07111f"); gradient.addColorStop(1, "#0b1a2a");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1280, 900);
  ctx.fillStyle = "#17344c"; ctx.fillRect(0, 68, 1280, 3);
  ctx.save(); ctx.translate(640, 360); ctx.scale(1.32, 1.32); ctx.translate(-640, -360);
  floorPolygon(ctx); drawRoute(ctx, frame);
  const packingStage: PackingStage = frame.person.pose === "pack-fill" ? "fill" : frame.person.pose === "pack-seal" ? "seal" : "open";
  const objects = [
    { depth: 5.2, draw: () => drawShelf(ctx) },
    ...(frame.cart ? [{ depth: frame.cart.x + frame.cart.y, draw: () => drawCart(ctx, frame.cart!, frame.cartFacing) }] : []),
    { depth: frame.scene === "packing" ? 20.9 : frame.person.position.x + frame.person.position.y, draw: () => drawWorker(ctx, frame) },
    { depth: 19.8, draw: () => drawPackingBench(ctx, packingStage) },
    ...(frame.cargo.position ? [{ depth: frame.scene === "hand" ? 20.1 : frame.cargo.position.x + frame.cargo.position.y + 0.01, draw: () => drawCargoBox(ctx, frame.cargo.position!, frame.cargo.baseZ) }] : []),
  ];
  objects.sort((a, b) => a.depth - b.depth).forEach((item) => item.draw());
  ctx.restore();
  ctx.fillStyle = "#d9f8ff"; ctx.font = "700 18px system-ui"; ctx.fillText("発送センター / 人物と設備の確認", 58, 82);
}
