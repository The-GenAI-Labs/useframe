import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RetrievalInputSchema, DECISION_AREAS } from "@repo/schemas";
import { retrieveWithOptions } from "@repo/rag";
import { prisma } from "@useframe/db";
const CaseSchema = z.object({
  name: z.string(),
  input: RetrievalInputSchema,
  expected: z.record(z.enum(DECISION_AREAS), z.array(z.string()).min(1)),
});
const args = process.argv.slice(2).filter((a) => a !== "--");
const allowed = [
  "--no-cache",
  "--no-hyde",
  "--dense-only",
  "--sparse-only",
  "--no-rerank",
];
if (args.some((a) => !allowed.includes(a)))
  throw new Error(`Flags: ${allowed.join(" ")}`);
const options = {
  noCache: true,
  noHyde: args.includes("--no-hyde"),
  denseOnly: args.includes("--dense-only"),
  sparseOnly: args.includes("--sparse-only"),
  noRerank: args.includes("--no-rerank"),
};
if (options.denseOnly && options.sparseOnly)
  throw new Error("Choose dense-only or sparse-only");
const directory = fileURLToPath(new URL("./cases/", import.meta.url));
try {
  const cases = await Promise.all(
    (await readdir(directory))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map(async (name) =>
        CaseSchema.parse(
          JSON.parse(await readFile(`${directory}/${name}`, "utf8")),
        ),
      ),
  );
  const expectedSlugs = [
    ...new Set(
      cases.flatMap((c) => Object.values(c.expected).flatMap((v) => v ?? [])),
    ),
  ];
  const known = new Set(
    (
      await prisma.researchFinding.findMany({
        where: { slug: { in: expectedSlugs }, status: "VERIFIED" },
        select: { slug: true },
      })
    ).map((f) => f.slug),
  );
  const missing = expectedSlugs.filter((slug) => !known.has(slug));
  if (missing.length)
    throw new Error(
      `Evaluation requires VERIFIED corpus findings for these labels: ${missing.join(", ")}. Update case labels to your reviewed corpus before running; missing findings must not produce misleading metrics.`,
    );
  let totalRecall = 0,
    reciprocalRank = 0,
    labeledAreas = 0,
    emptyAreas = 0,
    areaCount = 0,
    scoreTotal = 0,
    scoreCount = 0;
  for (const testCase of cases) {
    const result = await retrieveWithOptions(testCase.input, options);
    for (const area of result.areas) {
      areaCount++;
      if (!area.findings.length) emptyAreas++;
      for (const finding of area.findings)
        if (finding.rerankScore !== null) {
          scoreTotal += finding.rerankScore;
          scoreCount++;
        }
      const expected = testCase.expected[area.area];
      if (!expected) continue;
      const slugs = area.findings.slice(0, 5).map((f) => f.slug);
      const recall =
        expected.filter((slug) => slugs.includes(slug)).length /
        expected.length;
      const rank = slugs.findIndex((slug) => expected.includes(slug));
      totalRecall += recall;
      reciprocalRank += rank < 0 ? 0 : 1 / (rank + 1);
      labeledAreas++;
      console.log(
        JSON.stringify({
          case: testCase.name,
          area: area.area,
          recallAt5: recall,
          reciprocalRank: rank < 0 ? 0 : 1 / (rank + 1),
          slugs,
        }),
      );
    }
  }
  console.log(
    JSON.stringify(
      {
        options,
        cases: cases.length,
        labeledAreas,
        recallAt5: totalRecall / labeledAreas,
        mrr: reciprocalRank / labeledAreas,
        emptyAreaRate: emptyAreas / areaCount,
        averageRerankScore: scoreCount ? scoreTotal / scoreCount : null,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Retrieval evaluation failed",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
