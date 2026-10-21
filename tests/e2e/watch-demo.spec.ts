import { test, expect } from "@playwright/test";

test("every demo card can rise above its siblings and reset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const section = page.locator("#watch-demo");
  await section.scrollIntoViewIfNeeded();
  await expect(page.locator("#templates")).toHaveCount(0);
  await expect(section.locator("[data-demo-card]")).toHaveCount(4);
  await expect(section.locator('[data-demo-card="video"]')).toHaveCSS(
    "z-index",
    "5",
  );
  for (const id of ["models", "deployment", "domains", "video"]) {
    const card = section.locator(`[data-demo-card="${id}"]`);
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    await card.hover({
      position: {
        x:
          id === "video"
            ? bounds!.width / 2
            : ["deployment"].includes(id)
              ? bounds!.width - 40
              : 40,
        y: 50,
      },
    });
    await expect(card).toHaveCSS("z-index", "20");
    await expect(card).toHaveAttribute("data-active", "true");
    await expect(section.locator('[data-inactive="true"]')).toHaveCount(3);
    expect(
      await card.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          element.ownerDocument
            .elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            ?.closest("[data-demo-card]") === element
        );
      }),
    ).toBe(true);
    await section.getByRole("heading", { level: 2 }).hover();
    await expect(section.locator('[data-active="true"]')).toHaveCount(0);
  }
  await page.screenshot({ path: test.info().outputPath("demo-desktop.png") });
});

for (const width of [1024, 768, 390, 320]) {
  test(`demo fits at ${width}px and keeps controls accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const section = page.locator("#watch-demo");
    await section.scrollIntoViewIfNeeded();
    await expect(
      section.getByRole("button", { name: "Play UseFrame demo" }),
    ).toBeVisible();
    for (const card of await section.locator("[data-demo-card]").all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({
      path: test.info().outputPath(`demo-${width}.png`),
    });
  });
}

test("demo loads the exact video only on click and offers a fallback and close control", async ({
  page,
}) => {
  // Keep this contract test independent of YouTube availability and consent screens.
  await page.route("https://www.youtube.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Embedded player</body></html>",
    }),
  );
  await page.goto("/");
  const section = page.locator("#watch-demo");
  await expect(section.locator("iframe")).toHaveCount(0);
  await section.getByRole("button", { name: "Play UseFrame demo" }).click();
  const player = section.getByTitle("UseFrame demo — YouTube video player");
  await expect(player).toHaveAttribute(
    "src",
    "https://www.youtube.com/embed/DhJBlhw8Ye8?autoplay=1&controls=1&playsinline=1&rel=0",
  );
  await expect(player).toHaveAttribute("credentialless", "");
  await expect(
    section.getByRole("link", { name: "Watch on YouTube" }),
  ).toHaveAttribute("href", "https://www.youtube.com/watch?v=DhJBlhw8Ye8");
  await section.getByRole("button", { name: "Close demo video" }).click();
  await expect(player).toHaveCount(0);
  await expect(
    section.getByRole("button", { name: "Play UseFrame demo" }),
  ).toBeFocused();
});

test("keyboard focus raises every feature card with reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const section = page.locator("#watch-demo");
  await section.scrollIntoViewIfNeeded();
  for (const title of [
    "Build with Claude",
    "Launch on Cloudflare",
    "Your site. Your address.",
  ]) {
    const card = section.getByRole("button", { name: title, exact: true });
    await card.focus();
    await expect(card).toHaveCSS("z-index", "20");
    await expect(card).toHaveCSS("transform", "none");
    await page.keyboard.press("Escape");
    await expect(card).toHaveAttribute("data-active", "false");
  }
});
