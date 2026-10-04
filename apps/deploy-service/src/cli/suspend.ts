import { closeContext, deps } from "@/context.js";
import { setSuspended } from "@/services/siteAdmin.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const action = process.argv[2];
const projectId = arg("--project");
const reason = arg("--reason");
if (!projectId || (action === "suspend" && !reason) || !["suspend", "unsuspend"].includes(action ?? "")) {
  console.error('Usage: pnpm deploy:suspend --project <id> --reason "..." | pnpm deploy:unsuspend --project <id>');
  process.exit(2);
}
await setSuspended(deps, projectId, action === "suspend" ? reason! : null);
console.log(`${action}ed site for project ${projectId}; KV updated (allow ~60s to propagate).`);
await closeContext();
