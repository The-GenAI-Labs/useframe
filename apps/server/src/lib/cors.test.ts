import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import cors from "cors"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { corsOptions } from "./cors.js"

let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  app.use(cors(corsOptions("https://useframe.in/")))
  app.get("/x", (_req, res) => {
    res.json({ ok: true })
  })
  server = app.listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

describe("API CORS", () => {
  it("allows exactly the dashboard origin with credentials", async () => {
    const res = await fetch(`${base}/x`, { headers: { origin: "https://useframe.in" } })
    expect(res.headers.get("access-control-allow-origin")).toBe("https://useframe.in")
    expect(res.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("never reflects a sibling subdomain or wildcard", async () => {
    for (const origin of ["https://acme-x7k.useframe.in", "https://evil.example"]) {
      const res = await fetch(`${base}/x`, { headers: { origin } })
      const allowed = res.headers.get("access-control-allow-origin")
      expect(allowed).not.toBe(origin)
      expect(allowed).not.toBe("*")
    }
  })
})
