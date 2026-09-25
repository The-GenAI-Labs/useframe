import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { env } from "../config/env.js"

let client: S3Client | null = null

export function isR2Configured(): boolean {
  return !!(env.R2_BUCKET && env.R2_ENDPOINT && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY)
}

function getClient(): S3Client {
  if (client) return client
  client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return client
}

export async function uploadToR2(key: string, body: Buffer, contentType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
  return `${env.R2_ENDPOINT}/${env.R2_BUCKET}/${key}`
}

export async function uploadFramesToR2(
  prefix: string,
  frames: { label: string; image: Buffer }[],
): Promise<string[]> {
  if (!isR2Configured()) return []
  const urls: string[] = []
  for (const frame of frames) {
    if (frame.image.length === 0) continue
    const key = `${prefix}/${frame.label}.png`
    urls.push(await uploadToR2(key, frame.image, "image/png"))
  }
  return urls
}
