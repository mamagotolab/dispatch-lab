import { createScenario } from "./domain/scenario";
import { createRun } from "./domain/simulation";
import { browserClock, createPlayer, type PlayerSnapshot } from "./player";
import { buildSceneFrame, type ViewState } from "./render/frame";
import { drawWarehouseScene } from "./render/warehouse-scene";
import { mountUi } from "./ui";
import "./styles.css";

const root = document.querySelector<HTMLElement>("main")!;
const canvas = root.querySelector("canvas"); const error = root.querySelector<HTMLParagraphElement>(".canvas-error");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Canvas element is missing");
const context = canvas.getContext("2d");
if (!context) { if (error) error.hidden = false; canvas.hidden = true; }
const view: ViewState = { showRoutes: true, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, selectedOrderId: null };
let ui: ReturnType<typeof mountUi> | undefined;
const renderSnapshot = (snapshot: PlayerSnapshot): void => { ui?.update(snapshot); if (context && snapshot.state) drawWarehouseScene(context, buildSceneFrame(snapshot.state, snapshot.fraction, view)); };
const player = createPlayer({ clock: browserClock(), visibility: document, onFrame: renderSnapshot });
ui = mountUi(root, player, { onSelectOrder: (id) => { view.selectedOrderId = id; const snapshot = player.getSnapshot(); const item = snapshot.state?.orders.find((order) => order.id === id); const detail = root.querySelector<HTMLElement>("[data-selected-order]"); const labels = { scheduled: "受付前", waiting: "収集待ち", assigned: "棚へ移動中", picked: "商品を運搬中", packingQueue: "梱包待ち", packing: "梱包中", conveying: "搬送中", shipped: "積み込み済み" } as const; if (detail && item) detail.textContent = `${item.id}、商品${item.sku}：${labels[item.state]}`; renderSnapshot(snapshot); } });
root.querySelector<HTMLInputElement>("[data-routes]")?.addEventListener("change", (event) => { view.showRoutes = (event.currentTarget as HTMLInputElement).checked; renderSnapshot(player.getSnapshot()); });
const preview = createRun({ placement: "popularNear", staffing: "pick1Pack2", transport: "single", arrival: "steady", packing: "standard" }, createScenario("popularNear"));
if (context) drawWarehouseScene(context, buildSceneFrame(preview, 0, view));
ui.update(player.getSnapshot());
addEventListener("beforeunload", () => { ui?.dispose(); player.dispose(); }, { once: true });
