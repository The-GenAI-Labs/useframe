import { test, expect } from "../shared/test.js";

test("landing page loads without console errors and the main CTA leads to sign-in", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Toggle menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Get Started" }).click();

  await expect(page).toHaveURL(/\/signin$/);
  await expect(page.getByRole("heading", { name: "Welcome to UseFrame" })).toBeVisible();
  expect(errors).toEqual([]);
});
