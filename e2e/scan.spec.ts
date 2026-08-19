import { test, expect, signUp } from "./fixtures";

test.describe("scanner", () => {
  test("runs a scan for a custom symbol and shows a result or a clear failure", async ({
    page,
    account,
  }) => {
    await signUp(page, account);

    await page.goto("/scanner");
    await page.getByPlaceholder("Custom symbols — e.g. SPY, PLTR, BTC/USD").fill("SPY");
    await page.getByRole("button", { name: "Run scan" }).click();

    // Either a results table appears, or the scan surfaces its own error —
    // both are a completed round trip through the batch-scan API; a stuck
    // "Scanning…" button would not satisfy either.
    await expect(
      page.getByRole("heading", { name: "Results" }).or(page.getByText(/scan failed|failed:/i)),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Scanning…" })).toHaveCount(0);
  });

  test("shows the intraday alerts panel on the scanner", async ({ page, account }) => {
    await signUp(page, account);
    await page.goto("/scanner");
    await expect(page.getByText(/intraday/i).first()).toBeVisible();
  });
});
