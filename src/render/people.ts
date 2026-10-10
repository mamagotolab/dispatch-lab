import type { WorkerId } from "../domain/types";
import { project, type Point } from "./projection";

export type Facing = "se" | "sw" | "ne" | "nw";
export type Pose = "idle" | "walk" | "pick" | "carry" | "push" | "unload" | "pack-open" | "pack-fill" | "pack-seal";

export interface PersonInput {
  position: Point;
  facing: Facing;
  pose: Pose;
  walkPhase: number;
  workerId: WorkerId;
}

export interface PersonPart {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: "hair" | "skin" | "shirt" | "vest" | "trousers" | "boots" | "light";
}

export interface PersonShape {
  parts: PersonPart[];
  handAnchor: Point;
}

const WALK = [
  { left: -2, right: 2, arms: 2, bob: 0 },
  { left: -1, right: 1, arms: 1, bob: 1 },
  { left: 0, right: 0, arms: 0, bob: 1 },
  { left: 2, right: -2, arms: -2, bob: 0 },
  { left: 1, right: -1, arms: -1, bob: 1 },
  { left: 0, right: 0, arms: 0, bob: 0 },
] as const;

function mirrorPart(part: PersonPart): PersonPart {
  return { ...part, x: 16 - part.x - part.width };
}

export function buildPersonShape(input: Pick<PersonInput, "facing" | "pose" | "walkPhase">): PersonShape {
  const frame = Math.floor(((((input.walkPhase % 1) + 1) % 1) * 6) + 1e-6) % 6;
  const walking = input.pose === "walk" || input.pose === "carry" || input.pose === "push";
  const swingingArms = input.pose === "walk";
  const step = walking ? WALK[frame] : WALK[5];
  const back = input.facing === "ne" || input.facing === "nw";
  const west = input.facing === "sw" || input.facing === "nw";
  const reaching = input.pose === "pick" || input.pose === "unload";
  const holding = input.pose === "carry" || input.pose === "push";
  const packingArms = {
    "pack-open": { leftY: 12, rightY: 12, leftLength: 3, rightLength: 4 },
    "pack-fill": { leftY: 11, rightY: 8, leftLength: 2, rightLength: 5 },
    "pack-seal": { leftY: 9, rightY: 9, leftLength: 4, rightLength: 4 },
  }[input.pose as "pack-open" | "pack-fill" | "pack-seal"];
  const armY = input.pose === "push" ? (back ? 10 : 11) : reaching ? 10 : 12;
  const armLength = reaching ? 5 : holding ? 4 : 2;
  const leftArmY = packingArms?.leftY ?? armY;
  const rightArmY = packingArms?.rightY ?? armY;
  // 反対側の腕を伸ばすと両手を広げた形に見えるので、作業中の腕だけ伸ばす。
  const leftArmLength = packingArms?.leftLength ?? (holding ? 1 : reaching ? 2 : armLength);
  const rightArmLength = packingArms?.rightLength ?? armLength;
  const parts: PersonPart[] = [
    { id: "hair-back", x: 5, y: 1 + step.bob, width: 6, height: 3, color: "hair" },
    { id: "head", x: 5, y: 4 + step.bob, width: 6, height: 5, color: back ? "hair" : "skin" },
    { id: "neck", x: 7, y: 9 + step.bob, width: 2, height: 2, color: "skin" },
    { id: "torso", x: 4, y: 10 + step.bob, width: 8, height: 7, color: "vest" },
    { id: "collar", x: 5, y: 10 + step.bob, width: 6, height: 1, color: "shirt" },
    { id: "vest", x: 6, y: 11 + step.bob, width: 4, height: 5, color: "shirt" },
    { id: "left-arm", x: 4 - leftArmLength, y: leftArmY + step.bob + (swingingArms ? step.arms : 0), width: leftArmLength, height: 2, color: "skin" },
    { id: "right-arm", x: 12, y: rightArmY + step.bob - (swingingArms ? step.arms : 0), width: rightArmLength, height: 2, color: "skin" },
    { id: "left-leg", x: 5 + step.left, y: 17 + step.bob, width: 2, height: 5, color: "trousers" },
    { id: "right-leg", x: 9 + step.right, y: 17 + step.bob, width: 2, height: 5, color: "trousers" },
    { id: "left-boot", x: 4 + step.left, y: 22 + step.bob, width: 3, height: 2, color: "boots" },
    { id: "right-boot", x: 9 + step.right, y: 22 + step.bob, width: 3, height: 2, color: "boots" },
    { id: "badge", x: 9, y: 11 + step.bob, width: 1, height: 2, color: "light" },
  ];
  return { parts: west ? parts.map(mirrorPart) : parts, handAnchor: { x: west ? 4 - rightArmLength : 12 + rightArmLength, y: rightArmY + 1 + step.bob } };
}

const uniforms: Record<WorkerId, string> = { W1: "#62e6dc", W2: "#ffcf72", W3: "#bd9cff", W4: "#7fb6ff" };
const PERSON_SCALE = 3;

export function getPersonHandScreen(input: PersonInput): Point {
  const foot = project(input.position);
  const hand = buildPersonShape(input).handAnchor;
  return { x: foot.x - 8 * PERSON_SCALE + hand.x * PERSON_SCALE, y: foot.y - 24 * PERSON_SCALE + hand.y * PERSON_SCALE };
}

export function drawPerson(ctx: CanvasRenderingContext2D, input: PersonInput): void {
  const foot = project(input.position);
  const scale = PERSON_SCALE;
  const shape = buildPersonShape(input);
  const origin = { x: foot.x - 8 * scale, y: foot.y - 24 * scale };
  const palette = { hair: "#3f4f6d", skin: "#e2b189", shirt: "#eef7fb", vest: uniforms[input.workerId], trousers: "#31506b", boots: "#0b1a2a", light: "#efffff" } as const;
  ctx.fillStyle = "#02081366";
  ctx.beginPath();
  ctx.ellipse(foot.x, foot.y + 2, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const part of shape.parts) {
    ctx.fillStyle = palette[part.color];
    ctx.fillRect(Math.round(origin.x + part.x * scale), Math.round(origin.y + part.y * scale), part.width * scale, part.height * scale);
  }
}
