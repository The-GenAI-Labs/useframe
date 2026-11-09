import { test, expect } from "../shared/test.js";

test("the reviewer login is a plain 404 while disabled", async ({ page }) => {
  const response = await page.goto("/reviewer-login");
  expect(response?.status()).toBe(404);
  await expect(page.getByLabel("Password")).toHaveCount(0);
});

test("no public page links the reviewer login", async ({ page }) => {
  for (const path of ["/", "/pricing", "/signin", "/privacy"]) {
    await page.goto(path);
    await expect(page.locator('a[href*="reviewer-login"]')).toHaveCount(0);
  }
});
