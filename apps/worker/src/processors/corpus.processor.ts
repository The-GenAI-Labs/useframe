import { PubSub, type Message } from "@google-cloud/pubsub";
import { Queue, Worker, UnrecoverableError } from "bullmq";
import { QUEUES, type CorpusIngestJobPayload } from "@repo/events";
import { assertEmbeddingDimensions } from "@repo/rag";
import {
  CorpusEventSchema,
  corpusJobId,
  ingestFinding,
  isTransient,
} from "@repo/rag/ingestion";
import { env } from "../config/env.js";
import { redis } from "../lib/redis.js";

export async function handleCorpusMessage(
  message: Pick<Message, "attributes" | "ack" | "nack">,
  queue: Pick<Queue<CorpusIngestJobPayload>, "add">,
  bucket: string,
) {
  const parsed = CorpusEventSchema.safeParse(message.attributes);
  if (
    !parsed.success ||
    parsed.data.bucketId !== bucket ||
    parsed.data.eventType === "CLI"
  ) {
    message.ack();
    return;
  }
  try {
    await queue.add("ingest", parsed.data, {
      jobId: corpusJobId(parsed.data),
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
    });
    message.ack();
  } catch {
    message.nack();
  }
}

export async function startCorpusWorker() {
  await assertEmbeddingDimensions(env.EMBEDDING_DIMS);
  if (!env.VOYAGE_API_KEY)
    throw new Error(
      "VOYAGE_API_KEY is required when corpus ingestion is enabled",
    );
  const queue = new Queue<CorpusIngestJobPayload>(QUEUES.CORPUS_INGEST, {
    connection: redis,
  });
  const worker = new Worker<CorpusIngestJobPayload>(
    QUEUES.CORPUS_INGEST,
    async (job) => {
      const result = await ingestFinding(job.data, {
        forceReembed: job.data.eventType === "CLI",
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 5),
      }).catch((error: unknown) => {
        if (!isTransient(error))
          throw new UnrecoverableError(
            "Corpus processing failed; inspect worker configuration and permissions",
          );
        throw error;
      });
      if (result.outcome === "FAILED")
        throw new UnrecoverableError(
          "Corpus ingestion failed; inspect its result report",
        );
      return result;
    },
    { connection: redis, concurrency: 2, lockDuration: 120000 },
  );
  worker.on("error", (error) =>
    console.error("[corpus] Worker error:", error.message),
  );
  worker.on("failed", (job) => console.error("[corpus] Job failed:", job?.id));
  const pubsub = env.CORPUS_PUBSUB_SUBSCRIPTION
    ? new PubSub({ projectId: env.GCP_PROJECT_ID })
    : undefined;
  const subscription = pubsub?.subscription(env.CORPUS_PUBSUB_SUBSCRIPTION!, {
    flowControl: { maxMessages: 20 },
  });
  subscription?.on("message", (message) => {
    void handleCorpusMessage(message, queue, env.GCS_RESEARCH_CORPUS_BUCKET!);
  });
  subscription?.on("error", (error) =>
    console.error("[corpus] Subscription error:", error.message),
  );
  console.log("[corpus] Ingestion worker started");
  return {
    async close() {
      await subscription?.close();
      await pubsub?.close();
      await worker.close();
      await queue.close();
    },
  };
}
