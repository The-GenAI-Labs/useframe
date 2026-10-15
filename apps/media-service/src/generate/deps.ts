import type { prisma } from "@useframe/db"
import type { ImageProvider, Llm, MediaAiConfig, VideoProvider } from "@repo/media-ai"
import type { CreateAssetInput } from "@/createAsset.js"
import type { MediaStore } from "@/lib/storage.js"
import type { Semaphore } from "@/lib/semaphore.js"

export type GenerateDb = Pick<
  typeof prisma,
  | "mediaJob"
  | "mediaGeneration"
  | "mediaAsset"
  | "creditBalance"
  | "creditTransaction"
  | "projectVersion"
  | "project"
  | "researchReport"
  | "researchReportCitation"
  | "styleTag"
  | "projectBrief"
  | "$transaction"
>

export type GenerateConfig = {
  ai: MediaAiConfig
  imageQuality: string
  videoResolution: "480p" | "768p"
  videoTimeoutS: number
  promptExpansion: "disabled" | "balanced" | "quality"
  promptMaxChars: number
  // How long to wait for Part A processing to turn an upload into variants.
  assetTimeoutMs: number
  directUpload: boolean
}

export type ReservedAsset = { assetId: string; key: string }

export type GenerateDeps = {
  db: GenerateDb
  store: Pick<MediaStore, "getBuffer" | "presignPut">
  llm: Llm
  images: ImageProvider
  video: VideoProvider
  createAsset: (input: CreateAssetInput) => Promise<{ assetId: string }>
  reserveAsset: (input: { projectId: string; userId: string; kind: "VIDEO"; mime: string; purpose: string; generation: object }) => Promise<ReservedAsset>
  finishReserved: (asset: ReservedAsset) => Promise<boolean>
  download: (url: string) => Promise<Buffer>
  extractFrame: (video: Buffer, atSec: number) => Promise<Buffer>
  semaphores: { image: Semaphore; video: Semaphore; concepts: Semaphore }
  config: GenerateConfig
  sleep: (ms: number) => Promise<void>
}
