import type { Readable } from "node:stream"
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/config/env.js"

export type PresignedPut = { url: string; headers: Record<string, string> }

export type StoredObject = { body: Readable; contentLength: number }

export interface MediaStorage {
  presignPut(key: string, contentType: string, contentLength: number, expiresInSeconds: number): Promise<PresignedPut>
  head(key: string): Promise<{ size: number } | null>
  // range is an inclusive byte range, as in the HTTP Range header.
  get(key: string, range?: { start: number; end: number }): Promise<StoredObject | null>
  deletePrefix(prefix: string): Promise<number>
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  return err.name === "NoSuchKey" || err.name === "NotFound" || status === 404
}

export function createS3MediaStorage(config: {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}): MediaStorage {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // As in deploy-service; a default CRC32 would also be signed into presigned PUTs.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  const Bucket = config.bucket

  return {
    async presignPut(key, contentType, contentLength, expiresInSeconds) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
        { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type", "content-length"]) }
      )
      // Browsers set Content-Length themselves; listed for other clients.
      return { url, headers: { "Content-Type": contentType, "Content-Length": String(contentLength) } }
    },

    async head(key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket, Key: key }))
        return { size: res.ContentLength ?? 0 }
      } catch (err) {
        if (isNotFound(err)) return null
        throw err
      }
    },

    async get(key, range) {
      try {
        const res = await client.send(
          new GetObjectCommand({ Bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined })
        )
        if (!res.Body) return null
        return { body: res.Body as Readable, contentLength: res.ContentLength ?? 0 }
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
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 })
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

let storage: MediaStorage | null | undefined

export function mediaStorageEndpoint(): string {
  if (env.MEDIA_R2_ENDPOINT) return env.MEDIA_R2_ENDPOINT
  return env.CLOUDFLARE_ACCOUNT_ID ? `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com` : ""
}

export function getMediaStorage(): MediaStorage | null {
  if (storage !== undefined) return storage
  const endpoint = mediaStorageEndpoint()
  storage =
    endpoint && env.MEDIA_R2_ACCESS_KEY_ID && env.MEDIA_R2_SECRET_ACCESS_KEY
      ? createS3MediaStorage({
          endpoint,
          accessKeyId: env.MEDIA_R2_ACCESS_KEY_ID,
          secretAccessKey: env.MEDIA_R2_SECRET_ACCESS_KEY,
          bucket: env.MEDIA_R2_BUCKET,
        })
      : null
  return storage
}

export function setMediaStorageForTests(value: MediaStorage | null): void {
  storage = value
}
