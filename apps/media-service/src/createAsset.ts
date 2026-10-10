import { Readable } from "node:stream"
import { sniffAgrees, sniffMediaBytes, UPLOAD_IMAGE_MIMES, UPLOAD_VIDEO_MIMES } from "@repo/schemas"
import type { MediaProcessOptions } from "@repo/events"
import type { Prisma } from "@useframe/db"
import { mediaPrefix, type Deps } from "@/deps.js"
import { MediaRejectedError } from "@/processing/errors.js"

export type CreateAssetInput = {
  projectId: string
  userId: string
  kind: "IMAGE" | "VIDEO"
  origin: "UPLOADED" | "GENERATED"
  mime: string
  purpose?: string
  title?: string
  generation?: Prisma.InputJsonValue
  options?: MediaProcessOptions
} & ({ bytes: Buffer } | { stream: Readable; size: number })

const SNIFF_BYTES = 4096

async function peek(stream: Readable, size: number): Promise<{ head: Buffer; body: Readable }> {
  const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Uint8Array>
  const chunks: Buffer[] = []
  let length = 0
  while (length < Math.min(SNIFF_BYTES, size)) {
    const next = await iterator.next()
    if (next.done) break
    const buf = Buffer.from(next.value)
    chunks.push(buf)
    length += buf.length
  }
  const head = Buffer.concat(chunks)
  async function* rest() {
    yield head
    for (;;) {
      const next = await iterator.next()
      if (next.done) return
      yield next.value
    }
  }
  return { head: head.subarray(0, SNIFF_BYTES), body: Readable.from(rest()) }
}

// System-created media (Part B): upload type/size checks, but no user quota or tier rules.
export async function createAssetFromBytes(deps: Deps, input: CreateAssetInput): Promise<{ assetId: string }> {
  const allowed: readonly string[] = input.kind === "VIDEO" ? UPLOAD_VIDEO_MIMES : UPLOAD_IMAGE_MIMES
  if (!allowed.includes(input.mime)) throw new MediaRejectedError("Unsupported media type", input.mime)
  const size = "bytes" in input ? input.bytes.length : input.size
  const max = input.kind === "VIDEO" ? deps.config.maxVideoBytes : deps.config.maxImageBytes
  if (size <= 0 || size > max) throw new MediaRejectedError("The file is larger than allowed", `${size} bytes`)

  const { head, body } =
    "bytes" in input
      ? { head: input.bytes.subarray(0, SNIFF_BYTES), body: input.bytes }
      : await peek(input.stream, size)
  if (!sniffAgrees(input.mime, sniffMediaBytes(head))) {
    throw new MediaRejectedError("The file's contents don't match its type", "create sniff")
  }

  const asset = await deps.db.$transaction(async (tx) => {
    const created = await tx.mediaAsset.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        kind: input.kind,
        origin: input.origin,
        status: "PROCESSING",
        title: input.title?.slice(0, 120) ?? null,
        purpose: input.purpose ?? null,
        aiGenerated: input.origin === "GENERATED",
        generation: input.generation,
        originalKey: "",
        originalMime: input.mime,
        originalBytes: size,
      },
      select: { id: true },
    })
    return tx.mediaAsset.update({
      where: { id: created.id },
      data: { originalKey: `${mediaPrefix(input.projectId, created.id)}orig` },
      select: { id: true, originalKey: true },
    })
  })

  try {
    await deps.store.put(asset.originalKey, body, size, input.mime)
  } catch (err) {
    await deps.db.mediaAsset.delete({ where: { id: asset.id } }).catch(() => undefined)
    throw err
  }
  await deps.enqueue({ assetId: asset.id, ...(input.options ? { options: input.options } : {}) }, `${asset.id}-0`)
  return { assetId: asset.id }
}
