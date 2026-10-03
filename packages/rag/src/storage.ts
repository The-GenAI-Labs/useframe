import { getGcsStorage } from "@repo/validation/storage";

export interface CorpusStorage {
  currentGeneration(key: string): Promise<string | null>;
  download(key: string, generation: string): Promise<string>;
  report(key: string, result: unknown): Promise<void>;
  list(): Promise<Array<{ key: string; generation: string }>>;
}
export function corpusStorage(
  bucketName = process.env.GCS_RESEARCH_CORPUS_BUCKET,
): CorpusStorage {
  if (!bucketName) throw new Error("GCS_RESEARCH_CORPUS_BUCKET is required");
  const bucket = getGcsStorage().bucket(bucketName);
  return {
    async currentGeneration(key) {
      try {
        const [meta] = await bucket.file(key).getMetadata();
        return String(meta.generation);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 404
        )
          return null;
        throw error;
      }
    },
    async download(key, generation) {
      const [data] = await bucket
        .file(key, { generation })
        .download({ validation: "crc32c" });
      return data.toString("utf8");
    },
    async report(key, result) {
      await bucket
        .file(`_reports/${key.replace(/\.json$/, ".result.json")}`)
        .save(JSON.stringify(result, null, 2), {
          resumable: false,
          timeout: 30000,
          metadata: {
            contentType: "application/json",
            cacheControl: "private, no-store",
          },
        });
    },
    async list() {
      const result: Array<{ key: string; generation: string }> = [];
      for await (const file of bucket.getFilesStream({ prefix: "findings/" })) {
        if (/^findings\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file.name))
          result.push({
            key: file.name,
            generation: String(file.metadata.generation),
          });
      }
      return result;
    },
  };
}
