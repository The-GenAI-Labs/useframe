import { Storage } from "@google-cloud/storage";

export const SCREENSHOT_TTL_MS = 2 * 60 * 60 * 1000;
let storage: Storage | undefined;
function bucket() {
  const name = process.env.GCS_BUCKET;
  if (!name) throw new Error("GCS_BUCKET is required for validation");
  storage ??= new Storage({
    retryOptions: { maxRetries: 2, totalTimeout: 30 },
  });
  return storage.bucket(name);
}
export function validationPrefix(
  pipeline: "MAIN" | "REPLICATE",
  projectId: string,
  runId: string,
) {
  if (![projectId, runId].every((id) => /^[a-zA-Z0-9_-]+$/.test(id)))
    throw new Error("Invalid validation identifier");
  return `validation/${pipeline.toLowerCase()}/${projectId}/${runId}/`;
}
function validateKey(key: string) {
  if (
    !/^validation\/(main|replicate)\/[\w-]+\/[\w-]+\/(original|rendered\/\d+)\/[\w-]+\.png$/.test(
      key,
    )
  ) {
    throw new Error("Invalid validation screenshot key");
  }
}
export async function uploadToGcs(
  key: string,
  image: Buffer,
  expiresAt: Date,
): Promise<string> {
  validateKey(key);
  await bucket()
    .file(key)
    .save(image, {
      resumable: false,
      validation: "crc32c",
      timeout: 30000,
      metadata: {
        contentType: "image/png",
        cacheControl: "private, no-store",
        metadata: { expiresAt: expiresAt.toISOString() },
      },
    });
  return key;
}
export async function downloadScreenshot(
  key: string,
  expectedPrefix: string,
): Promise<Buffer> {
  validateKey(key);
  if (!key.startsWith(expectedPrefix))
    throw new Error("Screenshot does not belong to this run");
  const [data] = await bucket().file(key).download({ validation: "crc32c" });
  return data;
}
export async function deleteGcsPrefix(prefix: string): Promise<void> {
  if (!/^validation\/(main|replicate)\/[\w-]+\/[\w-]+\/$/.test(prefix))
    throw new Error("Refusing unsafe storage prefix");
  await bucket().deleteFiles({ prefix, force: true });
}
export async function deleteExpiredScreenshots(
  now = Date.now(),
): Promise<void> {
  const stream = bucket().getFilesStream({ prefix: "validation/" });
  for await (const file of stream) {
    const created = Date.parse(file.metadata.timeCreated ?? "");
    const expiry = Date.parse(String(file.metadata.metadata?.expiresAt ?? ""));
    const deadline = Math.min(
      Number.isFinite(expiry) ? expiry : Infinity,
      created + SCREENSHOT_TTL_MS,
    );
    if (Number.isFinite(deadline) && deadline <= now)
      await file.delete({ ignoreNotFound: true });
  }
}
