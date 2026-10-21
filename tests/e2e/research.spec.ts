import { test, expect } from "@playwright/test";

for (const width of [1440, 1024, 768, 390, 320]) {
  test(`research features remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const section = page.locator("#research");
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("heading", { level: 2 })).toBeVisible();
    const frame = section.locator("[data-research-card] > div");
    const bounds = await frame.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    if (width >= 1024) {
      expect(bounds!.width / width).toBeGreaterThanOrEqual(0.6);
      expect(bounds!.width / width).toBeLessThanOrEqual(0.7);
    }

    await expect(
      section.getByRole("button", { name: "Scroll to explore" }),
    ).toHaveCount(0);
    const card = section.getByRole("region", { name: "Research features" });
    await card.scrollIntoViewIfNeeded();
    const initialHeight = (await card.boundingBox())!.height;
    for (const name of [
      "Deep Search",
      "Competitor Analysis",
      "Website Score",
    ]) {
      const button = card.getByRole("button", { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(
        card.getByRole("link", { name: `Try ${name}` }),
      ).toHaveAttribute("href", "/signin");
      expect((await card.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
    }
    await expect(
      section.getByRole("link", { name: "Learn More" }),
    ).toHaveAttribute("href", "/research");
    await expect(
      section.getByRole("link", { name: "Get Started" }),
    ).toHaveAttribute("href", "/signin");
    await expect(section.locator("img")).toHaveJSProperty("complete", true);
    await page.screenshot({
      path: test.info().outputPath(`research-${width}.png`),
    });
  });
}

test("research respects reduced motion and supports keyboard exploration", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const section = page.locator("#research");
  await section.scrollIntoViewIfNeeded();
  await section
    .getByRole("button", { name: "Deep Search", exact: true })
    .focus();
  await expect(
    section.getByRole("button", { name: "Deep Search", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(
    section.getByRole("button", { name: "Competitor Analysis", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const imageLayer = section.locator("img").locator("..");
  await expect(imageLayer).toHaveCSS("transform", "none");
  await expect(imageLayer.locator("..")).toHaveCSS("transform", "none");
});
