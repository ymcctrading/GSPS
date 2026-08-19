import { test as base, expect, type Page } from "@playwright/test";

/** A fresh, disposable account signed up (not logged in) for the test. */
export type TestAccount = { email: string; password: string };

function randomAccount(): TestAccount {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { email: `e2e+${id}@example.com`, password: `E2e-test-pass-${id}` };
}

export async function signUp(page: Page, account: TestAccount) {
  await page.goto("/signup");
  await page.getByPlaceholder("Email").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

export async function logIn(page: Page, account: TestAccount) {
  await page.goto("/login");
  await page.getByPlaceholder("Email or username").fill(account.email);
  await page.getByPlaceholder("Password").fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

export const test = base.extend<{ account: TestAccount }>({
  account: async ({}, use) => {
    await use(randomAccount());
  },
});

export { expect };
