import { closeContext, deps } from "@/context.js";
import { reconcile } from "@/jobs/reconcile.js";

const args = new Set(process.argv.slice(2));
if (args.has("--apply") === args.has("--dry-run")) {
  console.error("Usage: pnpm deploy:kvs:reconcile --dry-run | --apply [--force] [--rewrite-values]");
  process.exit(2);
}
const report = await reconcile(deps, {
  apply: args.has("--apply"),
  force: args.has("--force"),
  rewriteValues: args.has("--rewrite-values"),
  sampleSize: 50,
});
console.log(JSON.stringify(report, null, 2));
if (report.capTripped && !report.applied && args.has("--apply")) {
  console.error("Diff exceeds the 5% safety cap. Re-run with --apply --force after reviewing it.");
  process.exitCode = 1;
}
await closeContext();
