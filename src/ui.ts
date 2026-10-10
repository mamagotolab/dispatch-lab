import { createScenario } from "./domain/scenario";
import { compareResults, getMetrics, getResult } from "./domain/metrics";
import { validate } from "./domain/validate";
import type { CompletedResult, RunConfig } from "./domain/types";
import type { PlayerSnapshot, createPlayer } from "./player";

type Player = ReturnType<typeof createPlayer>;
const stateLabels = { scheduled: "受付前", waiting: "収集待ち", assigned: "棚へ移動中", picked: "商品を運搬中", packingQueue: "梱包待ち", packing: "梱包中", conveying: "搬送中", shipped: "積み込み済み" } as const;
export function mountUi(root: HTMLElement, player: Player, options: { onSelectOrder?: (id: string) => void } = {}) {
  const form = root.querySelector<HTMLFormElement>("[data-settings]")!;
  const start = root.querySelector<HTMLButtonElement>("[data-action='start']")!;
  const pause = root.querySelector<HTMLButtonElement>("[data-action='pause']")!;
  const reset = root.querySelector<HTMLButtonElement>("[data-action='reset']")!;
  const speed = root.querySelector<HTMLSelectElement>("[name='speed']")!;
  const status = root.querySelector<HTMLElement>("[data-testid='run-status']")!;
  const metrics = root.querySelector<HTMLElement>("[data-testid='live-metrics']")!;
  const orders = root.querySelector<HTMLOListElement>("[data-orders]")!;
  const selected = root.querySelector<HTMLElement>("[data-selected-order]")!;
  const resultBox = root.querySelector<HTMLElement>("[data-result]")!;
  const comparisonBox = root.querySelector<HTMLElement>("[data-comparison]")!;
  const baselineButton = root.querySelector<HTMLButtonElement>("[data-action='baseline']")!;
  let baseline: CompletedResult | null = null; let latest: CompletedResult | null = null; const capturedRuns = new Set<number>();
  const listeners: Array<() => void> = [];
  const listen = (element: EventTarget, type: string, handler: EventListener) => { element.addEventListener(type, handler); listeners.push(() => element.removeEventListener(type, handler)); };
  const config = (): RunConfig => {
    const values = new FormData(form);
    return {
      placement: values.get("placement") as RunConfig["placement"],
      staffing: values.get("staffing") as RunConfig["staffing"],
      transport: values.get("transport") as RunConfig["transport"],
      arrival: values.get("arrival") as RunConfig["arrival"],
      packing: values.get("packing") as RunConfig["packing"],
    };
  };
  listen(start, "click", () => { const next = config(); const scenario = createScenario(next.placement, next.arrival); const checked = validate(next, scenario); if (checked.ok) player.start(next, scenario); else status.textContent = "開始できませんでした。設定を初期状態に戻してお試しください。"; });
  listen(pause, "click", () => { const phase = player.getSnapshot().phase; if (phase === "running") player.pause(); else if (phase === "paused") player.resume(); });
  listen(reset, "click", () => { const phase = player.getSnapshot().phase; if (phase === "running") player.pause(); if (["running", "paused"].includes(phase) && !window.confirm("進行中の発送を最初からやり直しますか？")) return; player.reset(); });
  listen(speed, "change", () => player.setSpeed(Number(speed.value) as 4 | 8));
  listen(baselineButton, "click", () => { if (latest) { baseline = structuredClone(latest); comparisonBox.textContent = "現在の結果を比較基準にしました"; baselineButton.disabled = true; } });
  listen(orders, "click", (event) => { const button = (event.target as Element).closest<HTMLButtonElement>("button[data-order-id]"); if (button) options.onSelectOrder?.(button.dataset.orderId!); });
  return {
    update(snapshot: PlayerSnapshot): void {
      const editable = snapshot.phase === "ready" || snapshot.phase === "finished" || snapshot.phase === "error";
      form.querySelectorAll<HTMLSelectElement>("select:not([name='speed'])").forEach((element) => { element.disabled = !editable; });
      start.disabled = !editable; pause.disabled = snapshot.phase === "ready" || snapshot.phase === "finished" || snapshot.phase === "error"; pause.textContent = snapshot.phase === "paused" ? "再開" : "一時停止";
      status.textContent = ({ ready: "条件を選んで発送を始めてください", running: "発送作業を進めています", paused: "一時停止中です。再開は手動です", finished: "全注文の発送が完了しました", error: "途中で停止しました。最初からやり直せます" })[snapshot.phase];
      if (!snapshot.state) { metrics.textContent = "積み込み 0/24　集める前 0　梱包待ち 0"; orders.replaceChildren(); selected.textContent = "注文を選ぶと現在の工程を説明します"; return; }
      const state = snapshot.state; const measured = getMetrics(state); metrics.textContent = `積み込み ${measured.shippedCount}/${measured.totalCount}　集める前 ${state.orders.filter((item) => item.state === "waiting").length}　梱包待ち ${state.orders.filter((item) => item.state === "packingQueue").length}`;
      orders.replaceChildren(...state.orders.map((item) => { const li = document.createElement("li"); const button = document.createElement("button"); button.type = "button"; button.dataset.orderId = item.id; button.textContent = `${item.id}　商品${item.sku}　${stateLabels[item.state]}`; li.append(button); return li; }));
      const seconds = (ticks: number | null) => ticks === null ? "—" : `${Math.round(ticks / 10)}秒`;
      resultBox.textContent = `最後の積み込みまで ${seconds(measured.lastShipmentTicks)}／平均 ${seconds(measured.averageLeadTicks)}／歩行 ${measured.totalWalkingDistance.toFixed(1)}m／最大梱包待ち ${measured.maximumPackingQueue}件`;
      if (snapshot.phase === "finished" && !capturedRuns.has(snapshot.runId)) {
        capturedRuns.add(snapshot.runId); latest = getResult(state);
        if (latest && !baseline) { baseline = structuredClone(latest); comparisonBox.textContent = "最初の完走結果を比較基準にしました"; baselineButton.disabled = true; }
        else if (latest && baseline) {
          const compared = compareResults(baseline, latest); baselineButton.disabled = false;
          if (!compared.ok) comparisonBox.textContent = compared.reason;
          else { const changed = (["placement", "staffing", "transport", "arrival", "packing"] as const).filter((key) => baseline!.config[key] !== latest!.config[key]).length; comparisonBox.textContent = `${changed > 1 ? "複数の条件を変えた結果です。" : ""} 基準との差：最終 ${Math.round(compared.deltas.lastShipmentTick / 10)}秒、平均 ${Math.round(compared.deltas.averageLeadTicks / 10)}秒、歩行 ${compared.deltas.totalWalkingDistance.toFixed(1)}m、最大待ち ${compared.deltas.maximumPackingQueue}件`; }
        }
      }
    },
    dispose(): void { listeners.forEach((remove) => remove()); },
  };
}
