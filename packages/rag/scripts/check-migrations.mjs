import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
const protectedNames = [
  "finding_chunks_embedding_hnsw_idx",
  "retrieval_cache_embedding_hnsw_idx",
  "research_findings_search_vector_idx",
  "research_findings_search_vector_trg",
];
export function unsafeDrops(sql) {
  const clean = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  return clean
    .split(";")
    .filter(
      (statement) =>
        /\bDROP\s+EXTENSION\s+(?:IF\s+EXISTS\s+)?"?vector\b/i.test(statement) ||
        (/\bDROP\s+(?:INDEX|TRIGGER)\b/i.test(statement) &&
          protectedNames.some((name) =>
            new RegExp(`\\b${name}\\b`, "i").test(statement),
          )),
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const diffIndex = process.argv.indexOf("--diff");
  if (diffIndex !== -1) {
    const path = process.argv[diffIndex + 1];
    if (!path) throw new Error("--diff requires a SQL file");
    if (unsafeDrops(await readFile(path, "utf8")).length) {
      console.error(
        "Schema push blocked: proposed SQL drops protected corpus/cache search objects. Use reviewed migrations.",
      );
      process.exit(2);
    }
    console.log("Schema diff preserves protected search objects");
    process.exit(0);
  }
  const root = fileURLToPath(
    new URL("../../db/prisma/migrations/", import.meta.url),
  );
  let failures = 0;
  for (const directory of await readdir(root, { withFileTypes: true })) {
    if (!directory.isDirectory()) continue;
    const path = join(root, directory.name, "migration.sql");
    const drops = unsafeDrops(await readFile(path, "utf8"));
    if (drops.length) {
      failures++;
      console.error(`${path}: cannot drop corpus search objects`);
    }
  }
  if (failures) process.exitCode = 1;
  else console.log("Corpus migration guard passed");
}
