import { fileURLToPath } from "node:url";
import { runConvert, runImportArticles } from "./corpusFiles.js";
import { orchestratorLabelProvider } from "./labels.js";

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const dirIndex = args.indexOf("--corpus-dir");
const corpusDir =
  (dirIndex >= 0 ? args[dirIndex + 1] : undefined) ??
  fileURLToPath(new URL("../../../corpus/", import.meta.url));

try {
  if (command === "convert") {
    const { exitCode } = await runConvert({
      corpusDir,
      dryRun: flag("--dry-run"),
      offline: flag("--offline"),
      checkUrls: flag("--check-urls"),
      provider: orchestratorLabelProvider(),
    });
    process.exitCode = exitCode;
  } else if (command === "import-articles") {
    const { prisma } = await import("@useframe/db");
    const { prismaArticleStore } = await import("./corpusArticles.js");
    try {
      const { exitCode } = await runImportArticles({
        corpusDir,
        dryRun: flag("--dry-run"),
        store: prismaArticleStore(prisma),
      });
      process.exitCode = exitCode;
    } finally {
      await prisma.$disconnect();
    }
  } else
    throw new Error(
      "Usage: convertCli.ts convert [--dry-run] [--offline] [--check-urls] | import-articles [--dry-run]",
    );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Corpus command failed",
  );
  process.exitCode = 1;
}
