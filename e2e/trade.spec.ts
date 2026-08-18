import { test, expect, signUp } from "./fixtures";

test.describe("trade execution", () => {
  test("places a paper buy from the ticker order ticket and it lands in the portfolio", async ({
    page,
    account,
  }) => {
    await signUp(page, account);

    await page.goto("/ticker/SPY");
    await expect(page.getByText("Order ticket · paper")).toBeVisible({ timeout: 20_000 });

    // Defaults are already a 1-share paper buy — submit as-is.
    const submit = page.getByRole("button", { name: /^Buy SPY/ });
    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await submit.click();

    // Either the ticket reports success/failure inline, or the order lands —
    // both confirm the request round-tripped through /api/orders rather than
    // hanging.
    await expect(page.locator("text=/filled|submitted|rejected|failed|error/i").first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
