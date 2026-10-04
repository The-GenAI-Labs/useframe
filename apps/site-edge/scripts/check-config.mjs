import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
if (config.includes("REPLACE_WITH_KV_NAMESPACE_ID")) {
  console.error(
    "wrangler.jsonc still has the placeholder KV namespace id. Set it to `terraform output kv_namespace_id` first.",
  );
  process.exit(1);
}
