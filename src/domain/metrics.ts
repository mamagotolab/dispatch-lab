import type { CompletedResult, Metrics, SimulationState } from "./types";

export function getMetrics(state: SimulationState): Metrics {
  const shipped = state.orders.filter((order) => order.state === "shipped" && order.shippedTick !== undefined);
  const averageLeadTicks = shipped.length === 0 ? null : shipped.reduce((sum, order) => sum + order.shippedTick! - order.arrivalTick, 0) / shipped.length;
  const allShipped = state.orders.length > 0 && shipped.length === state.orders.length;
  const firstArrival = state.orders.length ? Math.min(...state.orders.map((order) => order.arrivalTick)) : 0;
  const lastShipmentTicks = allShipped ? Math.max(...shipped.map((order) => order.shippedTick!)) - firstArrival : null;
  const completedDistance = state.workers.filter((worker) => worker.role === "picker").reduce((sum, worker) => sum + worker.distance, 0);
  const activeDistance = state.workers.filter((worker) => worker.role === "picker" && worker.action.type === "moving").reduce((sum, worker) => {
    if (worker.action.type !== "moving") return sum;
    const edges = worker.action.path.length - 1;
    const progress = Math.max(0, Math.min(1, (state.timeTick - worker.action.startTick) / (worker.action.endTick - worker.action.startTick)));
    return sum + edges * progress;
  }, 0);
  return { shippedCount: shipped.length, totalCount: state.orders.length, lastShipmentTicks, averageLeadTicks, totalWalkingDistance: completedDistance + activeDistance, maximumPackingQueue: state.maximumPackingQueue };
}

export function getResult(state: SimulationState): CompletedResult | null {
  if (state.status !== "finished") return null;
  const metrics = getMetrics(state);
  if (metrics.lastShipmentTicks === null || metrics.averageLeadTicks === null) return null;
  return { modelVersion: state.scenario.modelVersion, scenarioId: state.scenario.id, config: structuredClone(state.config), totalCount: state.orders.length, lastShipmentTick: metrics.lastShipmentTicks, averageLeadTicks: metrics.averageLeadTicks, totalWalkingDistance: metrics.totalWalkingDistance, maximumPackingQueue: metrics.maximumPackingQueue, orders: state.orders.map((order) => ({ id: order.id, arrivalTick: order.arrivalTick, shippedTick: order.shippedTick! })) };
}

export function compareResults(base: CompletedResult, current: CompletedResult) {
  if (base.modelVersion !== current.modelVersion) return { ok: false as const, reason: "モデル版が異なるため比較できません" };
  if (base.scenarioId !== current.scenarioId) return { ok: false as const, reason: "注文シナリオが異なるため比較できません" };
  return { ok: true as const, deltas: { lastShipmentTick: current.lastShipmentTick - base.lastShipmentTick, averageLeadTicks: current.averageLeadTicks - base.averageLeadTicks, totalWalkingDistance: current.totalWalkingDistance - base.totalWalkingDistance, maximumPackingQueue: current.maximumPackingQueue - base.maximumPackingQueue } };
}
