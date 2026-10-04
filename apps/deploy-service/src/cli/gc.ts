import { closeContext, deps } from "@/context.js";
import { runGc } from "@/jobs/gc.js";

const dryRun = process.argv.includes("--dry-run");
const result = await runGc(deps, { dryRun });
console.log(JSON.stringify({ dryRun, purged: result.purged }, null, 2));
await closeContext();
