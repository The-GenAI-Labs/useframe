import type { Page } from "playwright"

// tsx --watch's incremental rebuild occasionally leaves a stale esbuild
// __name() helper reference in the function text Playwright serializes for
// page.evaluate — the helper doesn't exist in the isolated browser eval
// scope. It's a transient watch-mode artifact, not a real logic error, and
// clears itself on the next evaluate call once the rebuild settles.
export async function evaluateSafe<R, Arg>(
  page: Page,
  fn: (arg: Arg) => R,
  arg: Arg,
): Promise<R>
export async function evaluateSafe<R>(page: Page, fn: () => R): Promise<R>
export async function evaluateSafe<R>(
  page: Page,
  fn: (arg?: unknown) => R,
  arg?: unknown,
): Promise<R> {
  try {
    return await page.evaluate(fn, arg)
  } catch (err) {
    if (err instanceof Error && err.message.includes("__name is not defined")) {
      return page.evaluate(fn, arg)
    }
    throw err
  }
}
