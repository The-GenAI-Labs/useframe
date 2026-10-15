import { createHash } from "node:crypto"

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

// Identity of what a blueprint was written against: page/section order and the copy framework.
export function briefHash(pages: readonly { slug: string; sections: readonly { type: string; index: number }[] }[], copyFramework: string): string {
  const shape = pages.map((p) => ({ slug: p.slug, sections: p.sections.map((s) => `${s.type}:${s.index}`) }))
  return sha256(JSON.stringify({ shape, copyFramework }))
}

export function requestKey(jobId: string, stage: string, itemId: string, attempt: number): string {
  return sha256(`${jobId}|${stage}|${itemId}|${attempt}`)
}

// Runware task ids are client-chosen UUIDs; deriving them from the request key
// makes a resubmission after a crash address the same task.
export function uuidFromKey(key: string): string {
  const h = sha256(key)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`
}
