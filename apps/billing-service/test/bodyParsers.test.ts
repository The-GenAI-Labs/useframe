import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import express from "express"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { WEBHOOK_PATH, useBodyParsers } from "@/lib/bodyParsers.js"

let server: Server
let base: string

beforeAll(async () => {
  const app = express()
  useBodyParsers(app)
  app.post(WEBHOOK_PATH, (req, res) => {
    res.json({ raw: Buffer.isBuffer(req.body), text: Buffer.isBuffer(req.body) ? req.body.toString("utf8") : null })
  })
  app.post("/checkout/create-order", (req, res) => {
    res.json({ raw: Buffer.isBuffer(req.body), body: req.body })
  })
  server = app.listen(0)
  await new Promise((resolve) => server.once("listening", resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

const post = (path: string, body: string) =>
  fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body }).then((r) => r.json())

describe("billing body parsers", () => {
  it("parses JSON for checkout instead of handing it a raw buffer", async () => {
    expect(await post("/checkout/create-order", JSON.stringify({ planSlug: "starter" }))).toEqual({
      raw: false,
      body: { planSlug: "starter" },
    })
  })

  it("keeps the exact raw bytes for the Razorpay webhook signature", async () => {
    const payload = '{"event":"payment.captured",  "payload":{}}'
    expect(await post(WEBHOOK_PATH, payload)).toEqual({ raw: true, text: payload })
  })
})
