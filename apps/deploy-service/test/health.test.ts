import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/schema.js";
import { startHealthServer } from "@/lib/health.js";

const REQUIRED = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_SERVICE_SECRET: "0123456789abcdef",
  SITES_BASE_DOMAIN: "useframe.in",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "token",
  SITES_KV_NAMESPACE_ID: "ns",
  SITES_R2_ACCESS_KEY_ID: "key",
  SITES_R2_SECRET_ACCESS_KEY: "secret",
};

describe("worker health server", () => {
  it("treats HEALTH_PORT as optional and validates its range", () => {
    const unset = parseEnv({ ...REQUIRED, HEALTH_PORT: "" });
    expect(unset.ok && unset.env.HEALTH_PORT).toBeUndefined();
    const set = parseEnv({ ...REQUIRED, HEALTH_PORT: "8080" });
    expect(set.ok && set.env.HEALTH_PORT).toBe(8080);
    expect(parseEnv({ ...REQUIRED, HEALTH_PORT: "70000" }).ok).toBe(false);
  });

  it("returns 200 while healthy and 503 otherwise", async () => {
    let healthy = true;
    const server = startHealthServer(0, () => healthy);
    await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/healthz`;
    try {
      expect((await fetch(url)).status).toBe(200);
      healthy = false;
      const res = await fetch(url);
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ status: "unavailable", service: "deploy-worker" });
    } finally {
      server.close();
    }
  });
});
