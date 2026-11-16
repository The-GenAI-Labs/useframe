import { test, expect, type Page } from "@playwright/test";

// Signed-in home with every API call stubbed, so only the web app needs to run.
async function signedInHome(page: Page) {
  const appOrigin = new URL(test.info().project.use.baseURL ?? "http://localhost:3000").origin;
  await page.route(
    (url) => url.origin !== appOrigin && url.pathname.startsWith("/api/"),
    (route) => {
      const { pathname } = new URL(route.request().url());
      const json = (data: unknown) => route.fulfill({ json: { success: true, data } });
      if (pathname === "/api/auth/refresh") return json({ accessToken: "e2e-token" });
      if (pathname === "/api/auth/me") {
        return json({ user: { id: "e2e-user", email: "e2e@example.com", name: "Alex", plan: "FREE" } });
      }
      if (pathname === "/api/credits") return json({ balance: 20, autoReload: null });
      return json([]);
    },
  );
  await page.goto("/?focus=1");
  await expect(page.getByRole("tablist", { name: "What useframe does" })).toBeVisible();
}

const TABS = [
  { name: "Research", heading: "Research first", action: "Start research", prompt: /^Research a website/ },
  { name: "Website", heading: "Build your site", action: "Build a website", prompt: /^Build a modern/ },
  { name: "SEO", heading: "Check your SEO", action: "Run an SEO check", prompt: /^Run an SEO check/ },
];

test("each tab shows its own card", async ({ page }) => {
  await signedInHome(page);
  const panel = page.getByRole("tabpanel");
  for (const tab of [...TABS, { name: "Deploy", heading: "Publish to the web" }]) {
    const button = page.getByRole("tab", { name: tab.name });
    await button.click();
    await expect(button).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", (await button.getAttribute("id"))!);
    await expect(panel.getByRole("heading", { name: tab.heading })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
  }
});

test("arrow keys, Home and End move between tabs", async ({ page }) => {
  await signedInHome(page);
  const tab = (name: string) => page.getByRole("tab", { name });
  await tab("Research").focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Website")).toBeFocused();
  await expect(tab("Website")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(tab("Deploy")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(tab("Research")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(tab("Deploy")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tab("Research")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { selected: true })).toHaveCount(1);
});

test("the card action fills the prompt and focuses it", async ({ page }) => {
  await signedInHome(page);
  const prompt = page.getByPlaceholder("Ask me anything...");
  for (const tab of TABS) {
    await page.getByRole("tab", { name: tab.name }).click();
    await page.getByRole("button", { name: tab.action }).click();
    await expect(prompt).toHaveValue(tab.prompt);
    await expect(prompt).toBeFocused();
  }
});

test("deploy says coming soon while publishing is off", async ({ page }) => {
  await signedInHome(page);
  await page.getByRole("tab", { name: "Deploy" }).click();
  const action = page.getByRole("button", { name: "Coming soon" });
  await expect(action).toHaveAttribute("aria-disabled", "true");
  await expect(action).toHaveAccessibleDescription(/isn't available yet/);
  await action.click({ force: true });
  await expect(page.getByPlaceholder("Ask me anything...")).toHaveValue("");
});
