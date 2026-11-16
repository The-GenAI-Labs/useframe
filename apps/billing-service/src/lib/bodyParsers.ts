import express, { type Express } from "express"

export const WEBHOOK_PATH = "/webhooks/razorpay"

// The Razorpay signature covers the raw bytes, so only the webhook keeps an
// unparsed body; a raw parser on "/" would leave every other route with a Buffer.
export function useBodyParsers(app: Express): void {
  app.use(WEBHOOK_PATH, express.raw({ type: "application/json" }))
  app.use(express.json({ limit: "1mb" }))
}
