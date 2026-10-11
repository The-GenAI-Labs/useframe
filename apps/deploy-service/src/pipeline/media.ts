import { CopyObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import type { R2 } from "@/lib/r2.js";
import { log } from "@/lib/logger.js";
import { mapWithConcurrency, withRetry } from "@/lib/retry.js";
import { DeployError } from "./errors.js";

export type MediaCopyItem = {
  assetId: string;
  // User-visible name for error messages; raw storage keys are never shown.
  title: string;
  sourceKey: string;
  // Relative to the deployment prefix, e.g. media/<assetId>/w960.1a2b3c4d.webp
  destRelPath: string;
  bytes: number;
  mime: string;
};

const IMMUTABLE = "public, max-age=31536000, immutable";

export class MissingMediaError extends DeployError {
  constructor(title: string) {
    super(`The media "${title}" is missing from storage. Remove it from the site or upload it again, then redeploy.`);
  }
}

function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return err.name === "NoSuchKey" || err.name === "NotFound" || status === 404;
}

// Scoped tokens may refuse cross-bucket CopyObject; after one refusal this process streams instead.
let preferStream = false;
const loggedPaths = new Set<string>();

function logPath(path: "copy" | "stream"): void {
  if (loggedPaths.has(path)) return;
  loggedPaths.add(path);
  log.info("media copy path in use", { path });
}

export function resetMediaCopyStateForTests(): void {
  preferStream = false;
  loggedPaths.clear();
}

async function sourceExists(source: R2, key: string): Promise<boolean> {
  try {
    await source.client.send(new HeadObjectCommand({ Bucket: source.bucket, Key: key }));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

async function streamCopy(source: R2, dest: R2, item: MediaCopyItem, destKey: string): Promise<void> {
  let body: Readable;
  try {
    const res = await source.client.send(new GetObjectCommand({ Bucket: source.bucket, Key: item.sourceKey }));
    if (!res.Body) throw new MissingMediaError(item.title);
    body = res.Body as Readable;
  } catch (err) {
    if (isNotFound(err)) throw new MissingMediaError(item.title);
    throw err;
  }
  await dest.client.send(
    new PutObjectCommand({
      Bucket: dest.bucket,
      Key: destKey,
      Body: body,
      ContentLength: item.bytes,
      ContentType: item.mime,
      CacheControl: IMMUTABLE,
    }),
  );
  logPath("stream");
}

async function copyOne(source: R2, dest: R2, item: MediaCopyItem, destKey: string): Promise<void> {
  if (!preferStream) {
    try {
      await dest.client.send(
        new CopyObjectCommand({
          Bucket: dest.bucket,
          Key: destKey,
          CopySource: `${source.bucket}/${item.sourceKey.split("/").map(encodeURIComponent).join("/")}`,
          MetadataDirective: "REPLACE",
          ContentType: item.mime,
          CacheControl: IMMUTABLE,
        }),
      );
      logPath("copy");
      return;
    } catch (err) {
      // Only the read token can tell a refused copy from a missing object.
      if (!(await sourceExists(source, item.sourceKey))) throw new MissingMediaError(item.title);
      preferStream = true;
      log.warn("media CopyObject failed; streaming instead", { assetId: item.assetId, error: (err as Error).name });
    }
  }
  await streamCopy(source, dest, item, destKey);
}

// Deployed sites keep their own copy, so later library changes never break them.
export async function copyMediaToSite(
  source: R2 | null | undefined,
  dest: R2,
  prefix: string,
  items: MediaCopyItem[],
): Promise<number> {
  if (items.length === 0) return 0;
  if (!source) {
    throw new DeployError("This site uses media, but media storage is not configured for deploys.", "MEDIA_R2_READ_* unset");
  }
  await mapWithConcurrency(items, 4, (item) =>
    withRetry(() => copyOne(source, dest, item, prefix + item.destRelPath), {
      attempts: 3,
      baseDelayMs: 500,
      shouldRetry: (err) => !(err instanceof DeployError),
    }),
  );
  return items.reduce((sum, item) => sum + item.bytes, 0);
}
