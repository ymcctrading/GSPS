import { test, expect, signUp, logIn } from "./fixtures";

test.describe("login", () => {
  test("signs up, lands on the dashboard, and can log back in", async ({ page, account }) => {
    await signUp(page, account);
    await expect(page.getByRole("link", { name: "GSPS" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await logIn(page, account);
    await expect(page.getByRole("link", { name: "GSPS" })).toBeVisible();
  });

  test("rejects a bad password", async ({ page, account }) => {
    await signUp(page, account);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

    await page.getByPlaceholder("Email or username").fill(account.email);
    await page.getByPlaceholder("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects an unauthenticated visitor away from a protected page", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});
