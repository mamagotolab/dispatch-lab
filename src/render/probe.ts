import type { PersonInput, Pose } from "./people";
import type { Point } from "./projection";
import type { CartFacing } from "./props";

export type ProbeScene = "hand" | "cart" | "packing";
export type CargoOwner = "shelf" | "hand" | "cart" | "worktop" | "handoff";
export interface ProbeFrame { scene: ProbeScene; label: string; person: PersonInput; cart: Point | null; cartFacing: CartFacing; cargo: { owner: CargoOwner; sku: "A"; position: Point | null; baseZ: number }; }

const pickup = { x: 3.9, y: 3.6 };
const handStart = { x: 7.4, y: 7.2 };
const handoff = { x: 8.5, y: 7.9 };
const cartStart = { x: 7.0, y: 7.1 };
const parkedCart = { x: 5.0, y: 9.0 };
const cartShelf = { x: 3.35, y: 4.0 };
const cartEnd = { x: 8.4, y: 7.8 };
const outboundCartOffset = { x: 0.7, y: -0.55 };
const returnCartOffset = { x: -0.7, y: 0.55 };
const packPosition = { x: 10.15, y: 9.55 };

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function between(from: Point, to: Point, progress: number): Point { const p = clamp(progress); return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p }; }
function person(position: Point, pose: Pose, facing: PersonInput["facing"], walkPhase: number): PersonInput { return { position, pose, facing, walkPhase, workerId: "W1" }; }
function withOffset(point: Point, offset: Point): Point { return { x: point.x + offset.x, y: point.y + offset.y }; }
function cargo(owner: CargoOwner, position: Point | null, baseZ = 39): ProbeFrame["cargo"] { return { owner, sku: "A", position, baseZ }; }
function cargoAtPerson(input: PersonInput): Point { return withOffset(input.position, input.facing === "se" || input.facing === "ne" ? { x: 0.72, y: 0.02 } : { x: 0.02, y: 0.72 }); }

export function buildProbeFrame(scene: ProbeScene, rawProgress: number): ProbeFrame {
  const progress = clamp(rawProgress);
  if (scene === "hand") {
    if (progress < 0.28) { const worker = person(between(handStart, pickup, progress / 0.28), "walk", "nw", progress * 12); return { scene, label: "棚へ歩いています", person: worker, cart: parkedCart, cartFacing: "se", cargo: cargo("shelf", null) }; }
    if (progress < 0.38) { const worker = person(pickup, "pick", "nw", 0); return { scene, label: "棚から商品を取っています", person: worker, cart: parkedCart, cartFacing: "se", cargo: cargo(progress < 0.33 ? "shelf" : "hand", progress < 0.33 ? null : cargoAtPerson(worker)) }; }
    if (progress < 0.82) {
      const worker = person(between(pickup, handoff, (progress - 0.38) / 0.44), "carry", "se", progress * 12);
      const turnStart = cargoAtPerson(person(pickup, "pick", "nw", 0));
      return { scene, label: "商品を手で運んでいます", person: worker, cart: parkedCart, cartFacing: "se", cargo: cargo("hand", between(turnStart, cargoAtPerson(worker), (progress - 0.38) / 0.08)) };
    }
    const worker = person(handoff, "unload", "se", 0);
    const transfer = between(cargoAtPerson(worker), { x: 10.06, y: 8.72 }, (progress - 0.82) / 0.12);
    return { scene, label: "商品を受け渡しています", person: worker, cart: parkedCart, cartFacing: "se", cargo: cargo(progress < 0.88 ? "hand" : "handoff", transfer) };
  }
  if (scene === "cart") {
    if (progress < 0.35) { const cart = between(cartStart, cartShelf, progress / 0.35); return { scene, label: "空の台車を棚へ押しています", person: person(withOffset(cart, outboundCartOffset), "push", "nw", progress * 12), cart, cartFacing: "nw", cargo: cargo("shelf", null) }; }
    const atShelf = withOffset(cartShelf, outboundCartOffset);
    if (progress < 0.48) { const worker = person(atShelf, "pick", "nw", 0); return { scene, label: "商品を取っています", person: worker, cart: cartShelf, cartFacing: "nw", cargo: cargo(progress < 0.43 ? "shelf" : "hand", progress < 0.43 ? null : cargoAtPerson(worker)) }; }
    if (progress < 0.62) {
      const worker = person(between(atShelf, withOffset(cartShelf, returnCartOffset), (progress - 0.48) / 0.14), "unload", "sw", 0);
      const loadProgress = clamp((progress - 0.48) / 0.12);
      return { scene, label: "商品を台車へ載せています", person: worker, cart: cartShelf, cartFacing: progress < 0.55 ? "nw" : "se", cargo: cargo(progress < 0.58 ? "hand" : "cart", between(cargoAtPerson(person(atShelf, "pick", "nw", 0)), cartShelf, loadProgress), 39 + (17 - 39) * loadProgress) };
    }
    const cart = between(cartShelf, cartEnd, (progress - 0.62) / 0.38);
    return { scene, label: "商品を載せた台車を押しています", person: person(withOffset(cart, returnCartOffset), "push", "se", progress * 12), cart, cartFacing: "se", cargo: cargo("cart", cart, 17) };
  }
  const pose: Pose = progress < 1 / 3 ? "pack-open" : progress < 2 / 3 ? "pack-fill" : "pack-seal";
  return { scene, label: pose === "pack-open" ? "箱を開いています" : pose === "pack-fill" ? "商品を箱へ入れています" : "箱を封かんしています", person: person(packPosition, pose, "ne", 0), cart: cartEnd, cartFacing: "se", cargo: cargo("worktop", null) };
}
