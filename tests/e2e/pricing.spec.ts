import { test, expect } from "../shared/test.js";

test("pricing lives on its own page and is linked from the landing navigation", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Simple pricing that scales with you" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Pricing" })
    .click();

  await expect(page).toHaveURL(/\/pricing$/);
  await expect(
    page.getByRole("heading", { name: "Simple pricing that scales with you" }),
  ).toBeVisible();
  await expect(page.locator("#pricing")).toBeVisible();
});
