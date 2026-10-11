import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: [
      "src/agents/chat.test.ts",
      "src/routes/chat.test.ts",
      "src/agents/chat.live.test.ts",
      "src/agents/briefPrefill.test.ts",
      "src/agents/briefResolve.test.ts",
      "src/lib/briefPipeline.test.ts",
      "src/tools/safeFetch.test.ts",
      "src/lib/docExtract.test.ts",
      "src/agents/mediaPlacement.test.ts",
    ],
  },
});
