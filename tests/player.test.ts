import { describe, expect, test } from "vitest";

import { createPlayer, type Clock, type VisibilitySource } from "../src/player";
import { singleA } from "./fixtures";

class FakeClock implements Clock {
  now = 0;
  nextId = 1;
  callbacks = new Map<number, (now: number) => void>();
  request(callback: (now: number) => void): number { const id = this.nextId++; this.callbacks.set(id, callback); return id; }
  cancel(id: number): void { this.callbacks.delete(id); }
  advance(milliseconds: number): void {
    this.now += milliseconds;
    const entry = [...this.callbacks.entries()][0];
    if (!entry) return;
    this.callbacks.delete(entry[0]); entry[1](this.now);
  }
  peek(): ((now: number) => void) | undefined { return [...this.callbacks.values()][0]; }
}

class FakeVisibility implements VisibilitySource {
  hidden = false;
  listener?: () => void;
  addEventListener(_type: "visibilitychange", listener: () => void): void { this.listener = listener; }
  removeEventListener(_type: "visibilitychange", listener: () => void): void { if (this.listener === listener) this.listener = undefined; }
  setHidden(hidden: boolean): void { this.hidden = hidden; this.listener?.(); }
}

const config = { placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" } as const;

describe("player clock", () => {
  test("pauses without advancing and resumes from a fresh timestamp", () => {
    const clock = new FakeClock();
    const player = createPlayer({ clock, onFrame: () => undefined });
    player.start(config, singleA("popularNear"));
    clock.advance(0); clock.advance(50);
    player.pause();
    const before = player.getSnapshot();
    clock.advance(5000);
    expect(player.getSnapshot()).toEqual(before);
    player.resume(); clock.advance(5000);
    expect(player.getSnapshot().state?.timeTick).toBe(before.state?.timeTick);
    clock.advance(25);
    expect(player.getSnapshot().state?.timeTick).toBe((before.state?.timeTick ?? 0) + 1);
  });

  test("caps a large frame gap at 100 milliseconds", () => {
    const clock = new FakeClock();
    const player = createPlayer({ clock, onFrame: () => undefined });
    player.start(config, singleA("popularNear")); clock.advance(0); clock.advance(5000);
    expect(player.getSnapshot().state?.timeTick).toBe(4);
  });

  test("runs eight-speed at twice the tick rate", () => {
    const clock = new FakeClock();
    const player = createPlayer({ clock, onFrame: () => undefined });
    player.start(config, singleA("popularNear")); player.setSpeed(8); clock.advance(0); clock.advance(50);
    expect(player.getSnapshot().state?.timeTick).toBe(4);
    expect(player.getSnapshot().fraction).toBe(0);
  });

  test("ignores an old callback after reset and a new start", () => {
    const clock = new FakeClock();
    const player = createPlayer({ clock, onFrame: () => undefined });
    player.start(config, singleA("popularNear"));
    const stale = clock.peek()!;
    player.reset(); player.start(config, singleA("popularFar"));
    const before = player.getSnapshot(); stale(9999);
    expect(player.getSnapshot()).toEqual(before);
  });

  test("ignores a canceled callback after pause and resume", () => {
    const clock = new FakeClock();
    const player = createPlayer({ clock, onFrame: () => undefined });
    player.start(config, singleA("popularNear"));
    const stale = clock.peek()!;
    player.pause(); player.resume();
    const before = player.getSnapshot(); stale(9999);
    expect(player.getSnapshot()).toEqual(before);
  });

  test("produces identical model results at both speeds with a pause", () => {
    const run = (speed: 4 | 8) => {
      const clock = new FakeClock();
      const player = createPlayer({ clock, onFrame: () => undefined });
      player.start(config, singleA("popularNear")); player.setSpeed(speed); clock.advance(0);
      clock.advance(100); player.pause(); clock.advance(5000); player.resume(); clock.advance(0);
      while (player.getSnapshot().phase === "running") clock.advance(100);
      return player.getSnapshot().state!;
    };
    const normal = run(4); const fast = run(8);
    expect(normal.orders.map((order) => order.shippedTick)).toEqual(fast.orders.map((order) => order.shippedTick));
    expect(normal.timeTick).toBe(470);
    expect(fast.timeTick).toBe(470);
  });

  test("pauses when hidden and does not resume on visibility return", () => {
    const clock = new FakeClock(); const visibility = new FakeVisibility();
    const player = createPlayer({ clock, visibility, onFrame: () => undefined });
    player.start(config, singleA("popularNear")); visibility.setHidden(true);
    expect(player.getSnapshot().phase).toBe("paused");
    visibility.setHidden(false);
    expect(player.getSnapshot().phase).toBe("paused");
  });

  test("dispose cancels frames and removes the visibility listener", () => {
    const clock = new FakeClock(); const visibility = new FakeVisibility();
    const player = createPlayer({ clock, visibility, onFrame: () => undefined });
    player.start(config, singleA("popularNear")); player.dispose();
    expect(clock.callbacks.size).toBe(0);
    expect(visibility.listener).toBeUndefined();
  });
});
