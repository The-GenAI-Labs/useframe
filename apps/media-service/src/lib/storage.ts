import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"

const MULTIPART_THRESHOLD = 5 * 1024 * 1024

export class TooLargeError extends Error {
  constructor() {
    super("object exceeds the allowed size")
    this.name = "TooLargeError"
  }
}

export interface MediaStore {
  // Streams an object to disk, refusing to write more than maxBytes.
  download(key: string, destPath: string, maxBytes: number): Promise<{ bytes: number; sha256: string } | null>
  uploadFile(key: string, absPath: string, size: number, contentType: string): Promise<void>
  put(key: string, body: Buffer | Readable, size: number, contentType: string): Promise<void>
  head(key: string): Promise<{ size: number } | null>
  deletePrefix(prefix: string): Promise<number>
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return err.name === "NoSuchKey" || err.name === "NotFound" || status === 404
}

// 5xx and network failures are worth retrying; everything else is final.
export function isTransientStorageError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  if (status !== undefined) return status >= 500 || status === 429
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|TimeoutError/i.test(`${err.name} ${err.message}`)
}

export function hashingLimiter(maxBytes: number) {
  const hash = createHash("sha256")
  let bytes = 0
  const transform = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      bytes += chunk.length
      if (bytes > maxBytes) return callback(new TooLargeError())
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  return { transform, result: () => ({ bytes, sha256: hash.digest("hex") }) }
}

export function createS3MediaStore(config: {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}): MediaStore {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Default CRC32 checksums from recent SDKs have broken R2 uploads before.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  const Bucket = config.bucket

  const put = async (key: string, body: Buffer | Readable, size: number, contentType: string) => {
    if (size > MULTIPART_THRESHOLD && !Buffer.isBuffer(body)) {
      await new Upload({
        client,
        params: { Bucket, Key: key, Body: body, ContentType: contentType },
        queueSize: 4,
        partSize: MULTIPART_THRESHOLD,
      }).done()
      return
    }
    await client.send(
      new PutObjectCommand({ Bucket, Key: key, Body: body, ContentLength: size, ContentType: contentType }),
    )
  }

  return {
    async download(key, destPath, maxBytes) {
      let res
      try {
        res = await client.send(new GetObjectCommand({ Bucket, Key: key }))
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
      if (!res.Body) return null
      if ((res.ContentLength ?? 0) > maxBytes) throw new TooLargeError()
      const limiter = hashingLimiter(maxBytes)
      await pipeline(res.Body as Readable, limiter.transform, createWriteStream(destPath, { mode: 0o600 }))
      return limiter.result()
    },

    uploadFile: (key, absPath, size, contentType) => put(key, createReadStream(absPath), size, contentType),

    put,

    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return { size: res.ContentLength ?? 0 }
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },

    async deletePrefix(prefix) {
      if (!prefix.endsWith("/")) throw new Error("Refusing to delete a non-directory prefix")
      let deleted = 0
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }),
        )
        const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []))
        if (objects.length) {
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects, Quiet: true } }))
          deleted += objects.length
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return deleted
    },
  }
}
