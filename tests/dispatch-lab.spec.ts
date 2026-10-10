import { expect, test } from "@playwright/test";

test("fits the warehouse and controls in a narrow viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dispatch-lab/");
  await expect(page.getByRole("heading", { name: "小さな発送センター・ラボ" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "発送を始める" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath("warehouse-360.png"), fullPage: true });
});

test("starts the fixed orders and freezes the scene while paused", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/dispatch-lab/");
  await page.getByRole("button", { name: "発送を始める" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("発送作業を進めています");
  await expect(page.locator("[data-orders] li")).toHaveCount(24);
  await expect(page.getByLabel("棚配置")).toBeDisabled();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "一時停止" }).click();
  const before = await page.locator("canvas").screenshot();
  await page.waitForTimeout(300);
  expect(await page.locator("canvas").screenshot()).toEqual(before);
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
  await page.locator("button[data-order-id='ID01']").click();
  await expect(page.locator("[data-selected-order]")).toContainText("ID01");
  await page.screenshot({ path: testInfo.outputPath("warehouse-paused.png"), fullPage: true });
});

test("keeps a running reset canceled and paused", async ({ page }) => {
  await page.goto("/dispatch-lab/");
  await page.getByRole("button", { name: "発送を始める" }).click();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "最初から" }).click();
  await expect(page.getByTestId("run-status")).toContainText("一時停止中");
  await expect(page.getByRole("button", { name: "再開" })).toBeVisible();
});

test("supports 390px and reduced motion without horizontal scrolling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dispatch-lab/");
  await page.getByRole("button", { name: "発送を始める" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator("canvas")).toBeVisible();
});

test("does not request external resources after load", async ({ page, baseURL }) => {
  const external: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (request) => { if (!request.url().startsWith(`${origin}/`)) external.push(request.url()); });
  await page.goto("/dispatch-lab/");
  await page.getByRole("button", { name: "発送を始める" }).click();
  await page.waitForTimeout(200);
  expect(external).toEqual([]);
});

test("keeps the HTML controls when canvas is unavailable", async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto("/dispatch-lab/");
  await expect(page.getByText("この環境では倉庫を表示できません")).toBeVisible();
  await expect(page.getByRole("button", { name: "発送を始める" })).toBeVisible();
});

test("runs the added conditions and keeps them locked while working", async ({ page }) => {
  await page.goto("/dispatch-lab/");
  await page.getByLabel("注文の入り方").selectOption("burst");
  await page.getByLabel("担当配分").selectOption("pick3Pack1");
  await page.getByLabel("運び方").selectOption("cart5");
  await page.getByLabel("梱包の速さ").selectOption("tooled");
  await page.getByRole("button", { name: "発送を始める" }).click();
  await expect(page.getByTestId("run-status")).toHaveText("発送作業を進めています");
  await expect(page.locator("[data-orders] li")).toHaveCount(24);
  for (const label of ["注文の入り方", "担当配分", "運び方", "梱包の速さ"]) await expect(page.getByLabel(label)).toBeDisabled();
  await page.waitForTimeout(200);
  await expect(page.getByTestId("live-metrics")).not.toHaveText("積み込み 0/24　集める前 0　梱包待ち 0");
});

test("offers a way back to the site", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/dispatch-lab/");
  const home = page.locator(".mgl-homebar a[href='/']").last();
  await expect(home).toBeVisible();
  await expect(home).toHaveText(/ホームへ/);
});
