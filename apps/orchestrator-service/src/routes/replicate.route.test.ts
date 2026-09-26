import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { Response } from "express";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@useframe/db", () => ({
  prisma: { replication: { findFirst: mocks.find, update: mocks.update } },
}));
vi.mock("@/agents/replicationOrchestrator.js", () => ({
  runReplicationOrchestrator: mocks.generate,
}));
vi.mock("@/lib/auth.js", () => ({ verifyToken: mocks.auth }));
vi.mock("@/llm/stream.js", async () => await import("../llm/stream.js"));
import router from "./replicate.route.js";

let server: Server;
let url: string;
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.auth.mockReturnValue({ id: "owner" });
  mocks.find.mockResolvedValue({
    status: "FAILED",
    buildSpec: "Saved spec",
    tier: "FREE",
    nextFiles: null,
  });
  mocks.update.mockResolvedValue({});
  mocks.generate.mockImplementation(async (res: Response) => {
    res.end();
  });
  const app = express();
  app.use(express.json(), router);
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  url = `http://127.0.0.1:${address.port}/replicate/generate`;
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
const post = () =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      replicationId: "replication",
      tier: "paid",
      buildSpec: "Untrusted spec",
    }),
  });

describe("replication generation endpoint", () => {
  it("retries the owned record using stored tier and spec", async () => {
    const response = await post();
    await response.text();
    expect(response.status).toBe(200);
    expect(mocks.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "replication", userId: "owner" },
      }),
    );
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.anything(),
      "replication",
      "Saved spec",
      "free",
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "GENERATING", failureReason: null },
      }),
    );
  });

  it("returns 404 for a record that the authenticated user does not own", async () => {
    mocks.find.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not regenerate a completed replication", async () => {
    mocks.find.mockResolvedValue({
      status: "READY",
      nextFiles: [
        { path: "app/page.tsx", content: "export default function Page() {}" },
      ],
    });
    const response = await post();
    expect(await response.text()).toContain("next_files_ready");
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("does not start a second generation when another request is running", async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    mocks.generate.mockImplementation(async (res: Response) => {
      await pending;
      res.end();
    });
    const first = await post();
    const second = await post();
    expect(await second.text()).toContain("already running");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    finish();
    await first.text();
  });

  it("rejects generation before a captured build spec exists", async () => {
    mocks.find.mockResolvedValue({ status: "RENDERING", buildSpec: null });
    expect((await post()).status).toBe(409);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
