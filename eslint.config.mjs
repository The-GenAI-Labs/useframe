import { globalIgnores } from "eslint/config";
import globals from "globals";
import { config as base } from "@useframe/eslint-config/base";
import { nextJsConfig } from "@useframe/eslint-config/next";
import { reactConfig } from "@useframe/eslint-config/react-internal";

// One config for the whole monorepo. Packages run `eslint .` and resolve this file.
export default [
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/.wrangler/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "packages/db/prisma/generated/**",
  ]),
  ...base,
  ...nextJsConfig(["apps/web/**/*.{js,jsx,ts,tsx}"], "apps/web/"),
  ...reactConfig(["packages/ui/**/*.{js,jsx,ts,tsx}"]),
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    // Code passed to Playwright's page.evaluate runs in the browser.
    files: ["apps/worker/scripts/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.browser, crossOriginIsolated: "readonly" } },
  },
  {
    // These tests call hooks directly against a mocked React, outside any component.
    files: ["apps/web/**/*.test.{ts,tsx}"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
];
