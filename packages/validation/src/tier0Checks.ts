import type { Page, ConsoleMessage, Request, Response } from "playwright";

export interface Tier0Result {
  passed: boolean;
  issues: Array<{ check: string; detail: string }>;
}
export async function runTier0Checks(
  previewUrl: string,
  page: Page,
): Promise<Tier0Result> {
  const found = new Map<string, { check: string; detail: string }>();
  const add = (check: string, detail: string) =>
    found.set(`${check}:${detail}`, { check, detail: detail.slice(0, 2000) });
  const consoleError = (msg: ConsoleMessage) => {
    if (msg.type() === "error") add("console_error", msg.text());
  };
  const pageError = (err: Error) => add("page_error", err.message);
  const failed = (req: Request) => {
    if (
      ["image", "media", "font", "stylesheet", "script"].includes(
        req.resourceType(),
      )
    )
      add("broken_asset", `${req.url()}: ${req.failure()?.errorText}`);
  };
  const responseError = (res: Response) => {
    if (
      res.status() >= 400 &&
      ["image", "media", "font", "stylesheet", "script"].includes(
        res.request().resourceType(),
      )
    )
      add("broken_asset", `${res.status()} ${res.url()}`);
  };
  page
    .on("console", consoleError)
    .on("pageerror", pageError)
    .on("requestfailed", failed)
    .on("response", responseError);
  try {
    const response = await page.goto(previewUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    if (!response?.ok())
      add("page_load", `HTTP ${response?.status() ?? "no response"}`);
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    if (height > 30000)
      throw new Error(
        "Page exceeds the safe 30000px capture limit; cannot verify complete coverage",
      );
    for (let y = 0; y < height; y += 700) {
      await page.evaluate((y) => window.scrollTo(0, y), y);
      await page.waitForTimeout(100);
    }
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    const broken = await page.evaluate(() =>
      Array.from(document.images)
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
    );
    for (const url of broken) add("broken_asset", `Image did not load: ${url}`);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 4,
    );
    if (overflow)
      add("layout_overflow", "Horizontal overflow detected on body");
    await page.evaluate(() => window.scrollTo(0, 0));
  } catch (error) {
    add(
      "page_load",
      error instanceof Error ? error.message : "Page could not load",
    );
  } finally {
    page
      .off("console", consoleError)
      .off("pageerror", pageError)
      .off("requestfailed", failed)
      .off("response", responseError);
  }
  return { passed: found.size === 0, issues: [...found.values()] };
}
