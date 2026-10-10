import type { Point } from "./types";

export const FLOOR_BOUNDS = { minX: 0, maxX: 12, minY: 0, maxY: 10 } as const;
const NEIGHBORS = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }] as const;

function key(point: Point): string {
  return `${point.x},${point.y}`;
}

export function isFloorPoint(point: Point): boolean {
  return Number.isInteger(point.x) && Number.isInteger(point.y)
    && point.x >= FLOOR_BOUNDS.minX && point.x <= FLOOR_BOUNDS.maxX
    && point.y >= FLOOR_BOUNDS.minY && point.y <= FLOOR_BOUNDS.maxY;
}

export function shortestPath(from: Point, to: Point, blocked: readonly Point[]): Point[] {
  if (!isFloorPoint(from) || !isFloorPoint(to)) throw new Error("経路の始点または終点が床の範囲外です");
  const blockedKeys = new Set(blocked.map(key));
  if (blockedKeys.has(key(from)) || blockedKeys.has(key(to))) throw new Error("経路の始点または終点が通行不可です");

  const startKey = key(from);
  const targetKey = key(to);
  const queue: Point[] = [{ ...from }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  const points = new Map<string, Point>([[startKey, { ...from }]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (key(current) === targetKey) break;
    for (const offset of NEIGHBORS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y };
      const nextKey = key(next);
      if (!isFloorPoint(next) || blockedKeys.has(nextKey) || previous.has(nextKey)) continue;
      previous.set(nextKey, key(current));
      points.set(nextKey, next);
      queue.push(next);
    }
  }

  if (!previous.has(targetKey)) throw new Error(`経路が見つかりません: ${startKey} → ${targetKey}`);
  const reversed: Point[] = [];
  for (let cursor: string | null = targetKey; cursor !== null; cursor = previous.get(cursor) ?? null) {
    reversed.push(points.get(cursor)!);
  }
  return reversed.reverse();
}
