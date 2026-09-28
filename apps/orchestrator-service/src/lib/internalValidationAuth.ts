import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";
export function isValidationWorker(req: Request): boolean {
  const actual = req.get("x-internal-secret") ?? "";
  const expected = env.INTERNAL_SERVICE_SECRET;
  return (
    !!expected &&
    Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  );
}
