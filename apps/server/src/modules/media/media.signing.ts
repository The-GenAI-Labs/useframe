import { createHmac, timingSafeEqual } from "node:crypto"
import { isMediaVariantRole, type MediaVariantRole } from "@repo/schemas"
import { env } from "@/config/env.js"

function signature(secret: string, assetId: string, role: string, exp: number): Buffer {
  return createHmac("sha256", secret).update(`${assetId}.${role}.${exp}`).digest()
}

// The only media URL minting path; `orig` is not a variant role, so it is never signable.
export function signMediaUrl(
  assetId: string,
  role: MediaVariantRole,
  ttlSeconds: number = env.MEDIA_SIGNED_URL_TTL_SECONDS,
  now = Date.now()
): string {
  if (!env.MEDIA_SIGNING_SECRET) throw new Error("MEDIA_SIGNING_SECRET is not configured")
  if (!isMediaVariantRole(role)) throw new Error("Only variant roles can be signed")
  // Rounded so a page of thumbnails signed in the same window shares cacheable URLs.
  const exp = Math.ceil((Math.floor(now / 1000) + ttlSeconds) / 60) * 60
  const sig = signature(env.MEDIA_SIGNING_SECRET, assetId, role, exp).toString("hex")
  const base = env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")
  return `${base}/media/${encodeURIComponent(assetId)}/${role}?exp=${exp}&sig=${sig}`
}

export function verifyMediaSignature(
  assetId: string,
  role: string,
  exp: unknown,
  sig: unknown,
  now = Date.now()
): boolean {
  if (!env.MEDIA_SIGNING_SECRET || !isMediaVariantRole(role)) return false
  if (typeof exp !== "string" || typeof sig !== "string" || !/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) {
    return false
  }
  const expNum = Number(exp)
  if (expNum < Math.floor(now / 1000)) return false
  const expected = signature(env.MEDIA_SIGNING_SECRET, assetId, role, expNum)
  return timingSafeEqual(Buffer.from(sig, "hex"), expected)
}
