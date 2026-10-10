export interface Point {
  x: number;
  y: number;
}

export function project(p: Point, z = 0): Point {
  return { x: 560 + 34 * (p.x - p.y), y: 180 + 17 * (p.x + p.y) - z };
}
