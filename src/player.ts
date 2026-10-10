import { createRun, step } from "./domain/simulation";
import type { RunConfig, Scenario, SimulationState } from "./domain/types";

export interface Clock { request(callback: (now: number) => void): number; cancel(id: number): void; }
export interface VisibilitySource {
  hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}
export type PlayerPhase = "ready" | "running" | "paused" | "finished" | "error";
export interface PlayerSnapshot { phase: PlayerPhase; state: SimulationState | null; fraction: number; runId: number; }

interface PlayerOptions { clock: Clock; onFrame: (snapshot: PlayerSnapshot) => void; visibility?: VisibilitySource; }

export function createPlayer({ clock, onFrame, visibility }: PlayerOptions) {
  let phase: PlayerPhase = "ready";
  let state: SimulationState | null = null;
  let accumulator = 0;
  let previousNow: number | null = null;
  let speed: 4 | 8 = 4;
  let runId = 0;
  let frameId: number | null = null;
  let frameToken = 0;
  let disposed = false;

  const snapshot = (): PlayerSnapshot => structuredClone({ phase, state, fraction: accumulator / 100, runId });
  const publish = (): void => onFrame(snapshot());
  const cancelFrame = (): void => {
    frameToken += 1;
    if (frameId !== null) clock.cancel(frameId);
    frameId = null;
  };

  const schedule = (): void => {
    if (disposed || phase !== "running") return;
    const token = ++frameToken;
    const scheduledRun = runId;
    frameId = clock.request((now) => {
      if (disposed || phase !== "running" || scheduledRun !== runId || token !== frameToken) return;
      frameId = null;
      if (previousNow === null) previousNow = now;
      else {
        accumulator += Math.max(0, Math.min(now - previousNow, 100)) * speed;
        previousNow = now;
        try {
          while (accumulator >= 100 && state?.status === "active") {
            state = step(state).state;
            accumulator -= 100;
          }
          if (state?.status === "finished") phase = "finished";
          else if (state?.status === "error") phase = "error";
        } catch (error) {
          if (state) { state.status = "error"; state.error = error instanceof Error ? error.message : "unknown"; }
          phase = "error";
        }
      }
      publish();
      schedule();
    });
  };

  const pause = (): void => {
    if (phase !== "running") return;
    cancelFrame(); previousNow = null; phase = "paused"; publish();
  };
  const visibilityChanged = (): void => { if (visibility?.hidden) pause(); };
  visibility?.addEventListener("visibilitychange", visibilityChanged);

  return {
    start(config: RunConfig, scenario: Scenario): void {
      cancelFrame(); runId += 1; accumulator = 0; previousNow = null;
      try { state = createRun(config, scenario); phase = state.status === "active" ? "running" : "error"; }
      catch { state = null; phase = "error"; }
      publish(); schedule();
    },
    pause,
    resume(): void { if (!disposed && phase === "paused" && state?.status === "active") { previousNow = null; phase = "running"; publish(); schedule(); } },
    reset(): void { cancelFrame(); runId += 1; accumulator = 0; previousNow = null; state = null; phase = "ready"; publish(); },
    setSpeed(value: 4 | 8): void { speed = value; },
    getSnapshot(): PlayerSnapshot { return snapshot(); },
    dispose(): void { if (disposed) return; disposed = true; cancelFrame(); visibility?.removeEventListener("visibilitychange", visibilityChanged); },
  };
}

export function browserClock(): Clock {
  return { request: (callback) => requestAnimationFrame(callback), cancel: (id) => cancelAnimationFrame(id) };
}
