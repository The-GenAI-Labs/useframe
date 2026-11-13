import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { startHealthServer } from "../src/lib/health.js";

describe("worker health server", () => {
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
      expect(await res.json()).toEqual({
        status: "unavailable",
        service: "worker",
      });
    } finally {
      server.close();
    }
  });
});
