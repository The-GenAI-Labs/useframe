import { defineConfig } from "vitest/config"

// scripts/*.test.mjs are standalone node scripts, not Vitest suites.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"] },
})
