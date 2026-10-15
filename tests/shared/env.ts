import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { assertSafeTargets } from "./guard.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.test"), quiet: true });

const value = (name: string, fallback: string) => process.env[name] || fallback;

export const testEnv = {
  root,
  baseUrl: value("BASE_URL", "http://localhost:3100"),
  apiUrl: value("API_URL", "http://localhost:4100"),
  orchestratorUrl: value("ORCHESTRATOR_URL", "http://localhost:4101"),
  billingUrl: value("BILLING_URL", "http://localhost:4102"),
  databaseUrl: value("DATABASE_URL", "postgresql://useframe:useframe@127.0.0.1:55432/useframe_test"),
  redisUrl: value("REDIS_URL", "redis://127.0.0.1:56379"),
  allowedHosts: value("ALLOWED_TARGET_HOSTS", ""),
  userEmail: value("TEST_USER_EMAIL", "e2e-free@useframe.test"),
  otherUserEmail: value("TEST_OTHER_USER_EMAIL", "e2e-other@useframe.test"),
  ci: !!process.env.CI,
};

assertSafeTargets(
  {
    BASE_URL: testEnv.baseUrl,
    API_URL: testEnv.apiUrl,
    ORCHESTRATOR_URL: testEnv.orchestratorUrl,
    BILLING_URL: testEnv.billingUrl,
    DATABASE_URL: testEnv.databaseUrl,
    REDIS_URL: testEnv.redisUrl,
  },
  testEnv.allowedHosts,
);

// @useframe/db reads DATABASE_URL when it is first imported.
process.env.DATABASE_URL = testEnv.databaseUrl;
