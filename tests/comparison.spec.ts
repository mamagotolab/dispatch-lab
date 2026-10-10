import { expect, test } from "@playwright/test";

test("keeps a completed baseline and compares a second configuration", async ({ page }) => {
  await page.clock.install();
  await page.goto("/dispatch-lab/");
  await page.getByLabel("再生速度").evaluate((select: HTMLSelectElement) => { select.add(new Option("テスト", "80")); select.value = "80"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await page.getByRole("button", { name: "発送を始める" }).click();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId("run-status")).toHaveText("全注文の発送が完了しました");
  await expect(page.locator("[data-comparison]")).toContainText("比較基準");

  await page.getByLabel("注文の入り方").selectOption("burst");
  await page.getByRole("button", { name: "発送を始める" }).click();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId("run-status")).toHaveText("全注文の発送が完了しました");
  await expect(page.locator("[data-comparison]")).toContainText("基準との差");
  await expect(page.locator("[data-comparison]")).not.toContainText("複数の条件");

  await page.getByLabel("棚配置").selectOption("popularFar");
  await page.getByLabel("運び方").selectOption("cart3");
  await page.getByRole("button", { name: "発送を始める" }).click();
  await page.clock.runFor(20_000);
  await expect(page.getByTestId("run-status")).toHaveText("全注文の発送が完了しました");
  await expect(page.locator("[data-comparison]")).toContainText("複数の条件を変えた結果です");
  await expect(page.getByRole("button", { name: "この結果を基準にする" })).toBeEnabled();
  await page.getByRole("button", { name: "この結果を基準にする" }).click();
  await expect(page.locator("[data-comparison]")).toHaveText("現在の結果を比較基準にしました");
});
