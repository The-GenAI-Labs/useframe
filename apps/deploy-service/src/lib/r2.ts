import { createReadStream } from "node:fs";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const MULTIPART_THRESHOLD = 5 * 1024 * 1024;

export type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type R2 = { client: S3Client; bucket: string };

export function createR2(config: R2Config): R2 {
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Default CRC32 checksums from recent SDKs have broken R2 uploads before.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket: config.bucket };
}

export async function uploadFile(
  r2: R2,
  key: string,
  absPath: string,
  size: number,
  contentType: string,
  cacheControl: string,
): Promise<void> {
  if (size > MULTIPART_THRESHOLD) {
    await new Upload({
      client: r2.client,
      params: {
        Bucket: r2.bucket,
        Key: key,
        Body: createReadStream(absPath),
        ContentType: contentType,
        CacheControl: cacheControl,
      },
      queueSize: 4,
      partSize: MULTIPART_THRESHOLD,
    }).done();
    return;
  }
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: createReadStream(absPath),
      ContentLength: size,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
}

export async function listKeys(r2: R2, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await r2.client.send(
      new ListObjectsV2Command({ Bucket: r2.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const obj of page.Contents ?? []) if (obj.Key) keys.push(obj.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

export async function getObjectBuffer(r2: R2, key: string): Promise<Buffer | null> {
  try {
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (err) {
    if (err instanceof Error && (err.name === "NoSuchKey" || err.name === "NotFound")) return null;
    throw err;
  }
}

export async function deletePrefix(r2: R2, prefix: string): Promise<number> {
  if (!prefix.endsWith("/")) throw new Error(`Refusing to delete non-directory prefix ${prefix}`);
  let deleted = 0;
  let token: string | undefined;
  do {
    const page = await r2.client.send(
      new ListObjectsV2Command({
        Bucket: r2.bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    const objects = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (objects.length > 0) {
      await r2.client.send(
        new DeleteObjectsCommand({ Bucket: r2.bucket, Delete: { Objects: objects, Quiet: true } }),
      );
      deleted += objects.length;
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}
