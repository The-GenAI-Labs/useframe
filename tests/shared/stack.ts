import path from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { testEnv } from "./env.js";
import { isLocal } from "./guard.js";

type WebServer = Extract<
  NonNullable<PlaywrightTestConfig["webServer"]>,
  unknown[]
>[number];

const repoRoot = path.resolve(testEnv.root, "..");
const portOf = (url: string) => new URL(url).port;
// Nothing listens here, so a stray call to an unused service fails fast instead of leaving the machine.
const UNUSED_SERVICE = "http://127.0.0.1:9";

// Test-only values. Every provider key is a dummy, overriding whatever the
// app's own .env holds, so no real LLM, payment, email or Cloudflare call can succeed.
const shared = {
  NODE_ENV: "development",
  DATABASE_URL: testEnv.databaseUrl,
  REDIS_URL: testEnv.redisUrl,
  CLIENT_URL: testEnv.baseUrl,
  JWT_ACCESS_SECRET: "test-only-access-secret-0000000000000000",
  INTERNAL_SERVICE_SECRET: "test-only-internal-secret",
  RESEARCH_SERVICE_URL: UNUSED_SERVICE,
  RESEARCH_MOCK: "true",
  MEDIA_AI_PROVIDER_MODE: "fake",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  DEEPSEEK_API_KEY: "",
  KIMI_API_KEY: "",
};

const services: { name: string; url: string; env: Record<string, string> }[] = [
  {
    name: "server",
    url: testEnv.apiUrl,
    env: {
      PORT: portOf(testEnv.apiUrl),
      FRONTEND_URL: testEnv.baseUrl,
      JWT_REFRESH_SECRET: "test-only-refresh-secret-000000000000000",
      ORCHESTRATOR_URL: testEnv.orchestratorUrl,
      BILLING_SERVICE_URL: testEnv.billingUrl,
      SCORING_SERVICE_URL: UNUSED_SERVICE,
      DEPLOY_SERVICE_URL: UNUSED_SERVICE,
      // "your-" placeholders make the OAuth buttons short-circuit instead of leaving the app.
      GOOGLE_CLIENT_ID: "your-google-client-id",
      GOOGLE_CLIENT_SECRET: "your-google-client-secret",
      GITHUB_CLIENT_ID: "your-github-client-id",
      GITHUB_CLIENT_SECRET: "your-github-client-secret",
      RESEND_API_KEY: "re_test_dummy",
      TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA",
      IPQS_API_KEY: "",
      VERCEL_TOKEN: "",
      // Media routes answer 503 without storage; an unreachable endpoint lets them run while
      // URL signing stays local.
      MEDIA_R2_ENDPOINT: UNUSED_SERVICE,
      MEDIA_R2_ACCESS_KEY_ID: "test",
      MEDIA_R2_SECRET_ACCESS_KEY: "test",
      MEDIA_SIGNING_SECRET: "test-only-media-signing-secret-00000000",
      MEDIA_PUBLIC_BASE_URL: testEnv.apiUrl,
    },
  },
  {
    name: "orchestrator-service",
    url: testEnv.orchestratorUrl,
    env: {
      PORT: portOf(testEnv.orchestratorUrl),
      // The orchestrator refuses to start without one LLM key; this one is invalid on purpose.
      ANTHROPIC_API_KEY: "sk-ant-test-invalid",
      BRAVE_API_KEY: "",
      JEV_API_KEY: "",
      TYPESAFE_API_KEY: "",
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
    },
  },
  {
    name: "billing-service",
    url: testEnv.billingUrl,
    env: {
      PORT: portOf(testEnv.billingUrl),
      RAZORPAY_KEY_ID: "rzp_test_dummy",
      RAZORPAY_KEY_SECRET: "test-only-razorpay-secret",
      RAZORPAY_WEBHOOK_SECRET: "test-only-webhook-secret",
    },
  },
];

// Starts the test stack on its own ports, or reuses it when already up.
// Skipped entirely for a remote (staging) target.
export function testStack(): WebServer[] | undefined {
  if (!isLocal(testEnv.baseUrl) || !isLocal(testEnv.apiUrl)) return undefined;

  const api: WebServer[] = services.map(({ name, url, env }) => ({
    command: `pnpm --filter @useframe/${name} dev`,
    url: `${url}/health`,
    cwd: repoRoot,
    env: { ...shared, ...env },
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  }));

  const web: WebServer = {
    command: `pnpm --filter @useframe/web exec next dev --turbopack -p ${portOf(testEnv.baseUrl)}`,
    url: testEnv.baseUrl,
    cwd: repoRoot,
    env: {
      NEXT_PUBLIC_API_SERVICE_URL: testEnv.apiUrl,
      NEXT_PUBLIC_ORCHESTRATOR_URL: testEnv.orchestratorUrl,
      // Cloudflare's documented always-pass test site key.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
    reuseExistingServer: true,
    timeout: 300_000,
    stdout: "ignore",
    stderr: "pipe",
  };

  return [...api, web];
}
