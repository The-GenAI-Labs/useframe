import { createHash } from "node:crypto";
import mime from "mime-types";
import { getObjectBuffer, listKeys, uploadFile, type R2 } from "@/lib/r2.js";
import { mapWithConcurrency, withRetry } from "@/lib/retry.js";
import { DeployError } from "./errors.js";
import type { OutputFile } from "./verifyOutput.js";

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "public, max-age=0, must-revalidate";
const DEFAULT = "public, max-age=3600";

export function contentTypeFor(relPath: string): string {
  return mime.contentType(relPath.split("/").pop() ?? relPath) || "application/octet-stream";
}

export function cacheControlFor(relPath: string): string {
  if (relPath.startsWith("_next/static/") || relPath.startsWith("assets/")) return IMMUTABLE;
  if (/\.html?$/i.test(relPath)) return REVALIDATE;
  const name = relPath.split("/").pop() ?? "";
  if (/[.-][0-9a-f]{8,}\./i.test(name)) return IMMUTABLE;
  return DEFAULT;
}

export function storagePrefixFor(projectId: string, deploymentId: string): string {
  return `sites/${projectId}/${deploymentId}/`;
}

export async function uploadOutput(r2: R2, prefix: string, files: OutputFile[]): Promise<void> {
  await mapWithConcurrency(files, 16, (file) =>
    withRetry(
      () =>
        uploadFile(
          r2,
          prefix + file.relPath,
          file.absPath,
          file.size,
          contentTypeFor(file.relPath),
          cacheControlFor(file.relPath),
        ),
      { attempts: 4, baseDelayMs: 500, shouldRetry: () => true },
    ),
  );
}

export async function verifyUpload(
  r2: R2,
  prefix: string,
  fileCount: number,
  rootHtmlSha256: string,
): Promise<void> {
  const keys = await listKeys(r2, prefix);
  if (keys.length !== fileCount) {
    throw new DeployError("Upload verification failed.", `expected ${fileCount} objects, found ${keys.length}`);
  }
  const index = await getObjectBuffer(r2, prefix + "index.html");
  const sha = index ? createHash("sha256").update(index).digest("hex") : null;
  if (sha !== rootHtmlSha256) throw new DeployError("Upload verification failed.", "index.html checksum mismatch");
}
