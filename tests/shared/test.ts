import { test as base, expect, type Page } from "@playwright/test";
import { testEnv } from "./env.js";
import type { Fixtures } from "./fixtures.js";
import { mintMagicLink } from "./fixtures.js";

type TestFixtures = {
  loginAs: (email: string) => Promise<void>;
};

type WorkerFixtures = { seeded: Fixtures };

export const test = base.extend<TestFixtures, WorkerFixtures>({
  seeded: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const raw = process.env.E2E_FIXTURES;
      if (!raw) throw new Error("E2E_FIXTURES is missing; run through the Playwright config so global setup seeds data.");
      await use(JSON.parse(raw) as Fixtures);
    },
    { scope: "worker" },
  ],

  // Opens the app's own magic-link landing page, exactly as the sign-in email would.
  loginAs: async ({ page }, use) => {
    await use((email) => signIn(page, email));
  },
});

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`/auth/verify?token=${await mintMagicLink(email)}`);
  await expect(page).toHaveURL(`${testEnv.baseUrl}/`);
}

export { expect, testEnv };
