import { NicheCategory, prisma } from "@useframe/db";
import { loadStyleDirectiveSeed, loadStyleTagSeed } from "./index.js";

// Upserts by key and never deletes: rows removed from the seed files stay in
// the database untouched. Seed files are the source of truth for every field
// they define, so edits made directly in the database are overwritten here.
async function main() {
  const tags = loadStyleTagSeed();
  const directives = loadStyleDirectiveSeed(Object.values(NicheCategory));

  // Generous limits: a cold serverless Postgres can take several seconds just
  // to hand out the first connection.
  await prisma.$transaction(
    [
      ...tags.map((tag) =>
        prisma.styleTag.upsert({
          where: { key: tag.key },
          create: tag,
          update: tag,
        }),
      ),
      ...directives.map((d) =>
        prisma.styleDirective.upsert({
          where: {
            niche_modelTarget: { niche: d.niche, modelTarget: d.modelTarget },
          },
          create: d,
          update: d,
        }),
      ),
    ],
    { maxWait: 20_000, timeout: 60_000 },
  );

  const count = (status: string) =>
    tags.filter((t) => t.status === status).length;
  console.log(
    `Seeded ${tags.length} style tags (${count("ACTIVE")} ACTIVE, ${count("DRAFT")} DRAFT) and ${directives.length} style directives.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
