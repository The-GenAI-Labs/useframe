import { mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { createHash } from "node:crypto"
import type { Deps } from "@/deps.js"
import { TooLargeError, type MediaStore } from "@/lib/storage.js"

type Row = Record<string, unknown>

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key]
    if (cond === null) return value === null || value === undefined
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { lt?: Date; not?: unknown }
      if (c.lt) return value instanceof Date && value < c.lt
      if ("not" in c) return value !== c.not
    }
    return value === cond
  })
}

export function createFakeDb() {
  const assets: Row[] = []
  const logs: Row[] = []
  const balances = new Map<string, number>()
  let seq = 0
  const mediaAsset = {
    findUnique: async ({ where }: { where: { id: string } }) => assets.find((a) => a.id === where.id) ?? null,
    findMany: async ({ where, take }: { where?: Row; take?: number }) =>
      assets.filter((a) => matches(a, where)).slice(0, take ?? Infinity),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = assets.filter((a) => matches(a, where))
      for (const row of rows) Object.assign(row, data)
      return { count: rows.length }
    },
    create: async ({ data }: { data: Row }) => {
      const row: Row = { id: `asset${++seq}`, deletedAt: null, altText: null, createdAt: new Date(), ...data }
      assets.push(row)
      return row
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) =>
      Object.assign(assets.find((a) => a.id === where.id)!, data),
    delete: async ({ where }: { where: { id: string } }) => {
      const i = assets.findIndex((a) => a.id === where.id)
      return assets.splice(i, 1)[0]
    },
  }
  const db = {
    mediaAsset,
    creditBalance: {
      findUnique: async ({ where }: { where: { userId: string } }) => ({ balance: balances.get(where.userId) ?? 0 }),
    },
    pipelineLog: {
      upsert: async ({ create }: { create: Row }) => {
        logs.push(create)
        return create
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  }
  return { db: db as unknown as Deps["db"], assets, logs, balances }
}

export function createFakeStore(): MediaStore & { objects: Map<string, Buffer>; failUploads: number } {
  const objects = new Map<string, Buffer>()
  const store = {
    objects,
    failUploads: 0,
    async download(key: string, dest: string, maxBytes: number) {
      const body = objects.get(key)
      if (!body) return null
      if (body.length > maxBytes) throw new TooLargeError()
      await writeFile(dest, body)
      return { bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") }
    },
    async uploadFile(key: string, absPath: string) {
      if (store.failUploads > 0) {
        store.failUploads--
        throw Object.assign(new Error("Service Unavailable"), { $metadata: { httpStatusCode: 503 } })
      }
      const { readFile } = await import("node:fs/promises")
      objects.set(key, await readFile(absPath))
    },
    async put(key: string, body: Buffer | Readable) {
      if (Buffer.isBuffer(body)) {
        objects.set(key, body)
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of body) chunks.push(Buffer.from(chunk as Uint8Array))
      objects.set(key, Buffer.concat(chunks))
    },
    async head(key: string) {
      const obj = objects.get(key)
      return obj ? { size: obj.length } : null
    },
    async deletePrefix(prefix: string) {
      let n = 0
      for (const key of [...objects.keys()]) if (key.startsWith(prefix) && objects.delete(key)) n++
      return n
    },
  }
  return store
}

export async function createDeps(overrides: Partial<Deps> = {}) {
  const fake = createFakeDb()
  const store = createFakeStore()
  const workDir = await mkdtemp(path.join(os.tmpdir(), "media-test-"))
  const enqueued: { payload: unknown; jobId: string }[] = []
  const deps: Deps = {
    db: fake.db,
    store,
    describe: null,
    enqueue: async (payload, jobId) => {
      enqueued.push({ payload, jobId })
    },
    config: {
      workDir,
      maxInputPixels: 60_000_000,
      maxVideoSeconds: 60,
      maxImageBytes: 20 * 1024 * 1024,
      maxVideoBytes: 150 * 1024 * 1024,
      ffmpeg: { ffmpegPath: "ffmpeg", ffprobePath: "ffprobe", timeoutMs: 60_000, threads: 2 },
    },
    ...overrides,
  }
  return { deps, fake, store, workDir, enqueued }
}
