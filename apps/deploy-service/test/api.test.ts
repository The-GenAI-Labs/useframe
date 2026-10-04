import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@useframe/db", () => ({
  refundCredits: vi.fn(),
  RefundRejectedError: class extends Error {},
  ensureValidationRun: vi.fn(),
}));

const { createApp } = await import("@/app.js");

const SECRET = "0123456789abcdef0123";
const lockHeld = new Set<string>();

const deps = {
  db: {
    project: { findFirst: vi.fn().mockResolvedValue({ id: "p1", userId: "u1" }) },
    projectVersion: { findFirst: vi.fn().mockResolvedValue({ id: "v1" }) },
    projectSite: {
      findUnique: vi.fn().mockResolvedValue({
        id: "s1",
        defaultHost: "acme-x7k.useframe.in",
        primaryHost: "acme-x7k.useframe.in",
        suspendedAt: null,
      }),
    },
    deployment: { findFirst: vi.fn().mockResolvedValue(null) },
  },
  redis: {
    set: vi.fn(async (key: string) => {
      if (lockHeld.has(key)) return null;
      lockHeld.add(key);
      return "OK";
    }),
    eval: vi.fn(async (_s: string, _n: number, key: string) => {
      lockHeld.delete(key);
      return 1;
    }),
    get: vi.fn(),
  },
  kv: {},
  r2: {},
  runQueue: { add: vi.fn(), getJob: vi.fn() },
  config: { baseDomain: "useframe.in", reaperStuckMinutes: 30 },
} as never;

let server: Server;
let base: string;
beforeAll(async () => {
  server = createApp(deps, SECRET).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.close();
});

const post = (path: string, body: unknown, secret = SECRET) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal-secret": secret },
    body: JSON.stringify(body),
  });

describe("internal API", () => {
  it("answers health without auth", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("rejects calls without the internal secret", async () => {
    const res = await post("/internal/deployments", {}, "wrong-secret-wrong-secret");
    expect(res.status).toBe(401);
  });

  it("validates the request body", async () => {
    const res = await post("/internal/deployments", { projectId: "../x" });
    expect(res.status).toBe(422);
  });

  it("answers 409 while another deployment holds the project lock", async () => {
    lockHeld.add("deploy:project:p1");
    const res = await post("/internal/deployments", { projectId: "p1", versionId: "v1", userId: "u1" });
    expect(res.status).toBe(409);
    expect((await res.json()).success).toBe(false);
    lockHeld.clear();
  });

  it("keeps custom domains off when the feature is disabled", async () => {
    const get = await fetch(`${base}/internal/projects/p1/domains`, { headers: { "x-internal-secret": SECRET } });
    expect(await get.json()).toEqual({ success: true, data: { enabled: false, domain: null } });
    const add = await post("/internal/projects/p1/domains", { hostname: "www.acme.com" });
    expect(add.status).toBe(404);
    expect(await add.json()).toMatchObject({ success: false, code: "feature_disabled" });
  });

  it("refuses another user's project", async () => {
    const res = await post("/internal/deployments", { projectId: "p1", versionId: "v1", userId: "intruder" });
    expect(res.status).toBe(403);
  });
});
