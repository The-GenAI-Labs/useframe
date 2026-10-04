import dotenv from "dotenv";
import { parseEnv } from "./schema.js";

dotenv.config();

const parsed = parseEnv(process.env);

if (!parsed.ok) {
  console.error("Invalid environment variables:");
  console.error(parsed.errors);
  process.exit(1);
}

export const env = parsed.env;

if (env.DEPLOY_BUILD_ISOLATION === "none") {
  console.warn(
    "WARNING: DEPLOY_BUILD_ISOLATION=none — builds run as this process's user with no uid/gid separation. Development only.",
  );
}
