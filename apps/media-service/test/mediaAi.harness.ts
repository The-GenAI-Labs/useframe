import {
  applyCheckpointAction,
  createMediaJob,
  FakeImageProvider,
  FakeLlm,
  FakeVideoProvider,
  loadMediaAiConfig,
  solidPng,
  type CheckpointAction,
  type Llm,
  type MediaBrief,
  type MediaItem,
} from "@repo/media-ai"
import type { SiteSpec } from "@repo/schemas"
import { localSemaphore } from "@/lib/semaphore.js"
import type { GenerateDb, GenerateDeps } from "@/generate/deps.js"
import { createMemoryDb } from "@repo/media-ai/testing"

export const config = loadMediaAiConfig({ MEDIA_ENABLED: "true" })
const USER = "user_1"
const PROJECT = "proj_1"
const VERSION = "ver_1"

type SectionType = SiteSpec["pages"][number]["sections"][number]["type"]

const section = (type: SectionType, index: number, items = 0) => ({
  type,
  index,
  content: { headline: `${type} headline`, body: "Body", items: Array.from({ length: items }, (_, i) => ({ title: `Item ${i}`, description: "Desc" })) },
})

export const PAGES = [
  {
    type: "HOME",
    slug: "home",
    title: "Home",
    sections: [section("HERO", 0), section("FEATURES", 1, 3), section("HOW_IT_WORKS", 2, 3), section("CTA", 3), section("FOOTER", 4)],
  },
] as SiteSpec["pages"]

const visualSystem = {
  lighting: "soft window light",
  lens: "50mm",
  texture: "matte paper",
  compositionRules: ["one subject"],
  recurringMotif: "paper planes",
  colorUsage: "primary on hero objects",
  doNot: [],
}

export const MEDIA_BRIEF: MediaBrief = {
  subject: "Bookkeeping software for small studios",
  audience: { segment: "B2B" },
  message: "Your books, finished without the busywork",
  mood: ["calm"],
  palette: { primary: "#2563eb", secondary: "#f1f5f9", accent: "#f97316", neutrals: [] },
  styleDirection: "Soft natural light, tactile paper objects",
  researchFindingIds: [],
  avoid: ["readable text"],
  budget: { maxImages: 8, maxVideos: 3 },
  hasProductPhotoUploads: false,
  blueprint: { narrative: "From scattered effort to one calm result.", visualSystem },
}

export function image(itemId: string, slotId: string, priority = 1): MediaItem {
  return {
    itemId,
    slotId,
    kind: "image",
    decision: "GENERATE",
    role: "hook",
    intent: "Make the outcome feel effortless",
    subjectDirection: "A paper plane over a desk",
    mood: ["calm"],
    aspect: "16:9",
    display: slotId.endsWith("background") ? "background" : "inline",
    textSafeZone: "left",
    priority,
    reason: "Sets the tone",
  }
}

export function video(itemId: string, slotId: string, priority = 1): MediaItem {
  return { ...image(itemId, slotId, priority), kind: "video", video: { durationSec: 6, loopable: false, motionIntent: "slow glide", playWhen: "in_view" } }
}

export type HarnessOptions = {
  mode?: "AUTO" | "MANUAL"
  items: MediaItem[]
  balance?: number
  llm?: Llm
  images?: FakeImageProvider
  video?: GenerateDeps["video"]
  imageLimit?: number
}

export async function harness(opts: HarnessOptions) {
  const db = createMemoryDb()
  const store = new Map<string, Buffer>()
  await db.creditBalance.create({ data: { userId: USER, balance: opts.balance ?? 1000 } })
  await db.project.create({ data: { id: PROJECT, userId: USER, currentVersionId: VERSION } })
  await db.projectVersion.create({
    data: {
      id: VERSION,
      projectId: PROJECT,
      versionNumber: 1,
      siteType: "SINGLE_PAGE",
      seo: {},
      snapshot: { pages: PAGES, copyFramework: "AIDA", media: {}, designSystem: { primaryColor: "#2563eb", secondaryColor: "#f1f5f9", accentColor: "#f97316" } },
    },
  })

  const putAsset = async (kind: "IMAGE" | "VIDEO", bytes: Buffer, generation: unknown, status = "READY") => {
    const row = await db.mediaAsset.create({ data: { projectId: PROJECT, userId: USER, kind, origin: "GENERATED", status, generation } })
    const key = `media/${row.id as string}`
    store.set(`${key}/original`, bytes)
    const still = kind === "IMAGE" ? bytes : solidPng(96, 54, [40, 90, 200])
    const roles = kind === "IMAGE" ? ["fallback", "w960", "w1600"] : ["poster", "poster_last", "mp4_720"]
    for (const role of roles) store.set(`${key}/${role}`, role === "mp4_720" ? bytes : still)
    await db.mediaAsset.update({
      where: { id: row.id },
      data: { originalKey: `${key}/original`, variants: roles.map((role) => ({ role, key: `${key}/${role}` })) },
    })
    return row.id as string
  }

  const imageSemaphore = localSemaphore(opts.imageLimit ?? 2)
  const videoSemaphore = localSemaphore(2)
  const images = opts.images ?? new FakeImageProvider()
  const videoProvider = opts.video ?? new FakeVideoProvider()
  const deps: GenerateDeps = {
    db: db as unknown as GenerateDb,
    store: {
      getBuffer: async (key: string) => store.get(key) ?? null,
      presignPut: async (key: string) => `https://upload.test/${key}`,
    } as GenerateDeps["store"],
    llm: opts.llm ?? new FakeLlm(),
    images,
    video: videoProvider,
    createAsset: async (input) => ({ assetId: await putAsset(input.kind, "bytes" in input ? input.bytes : Buffer.alloc(0), input.generation) }),
    reserveAsset: async (input) => {
      const assetId = await putAsset("VIDEO", Buffer.from("pending"), input.generation, "UPLOADING")
      return { assetId, key: `media/${assetId}/original` }
    },
    finishReserved: async (asset) => {
      await db.mediaAsset.update({ where: { id: asset.assetId }, data: { status: "READY" } })
      return true
    },
    download: async () => Buffer.from("fake-mp4"),
    extractFrame: async () => solidPng(96, 54, [40, 90, 200]),
    semaphores: { image: imageSemaphore, video: videoSemaphore, concepts: localSemaphore(1) },
    config: {
      ai: config,
      imageQuality: "high",
      videoResolution: "768p",
      videoTimeoutS: 600,
      promptExpansion: "disabled",
      promptMaxChars: 1500,
      assetTimeoutMs: 1000,
      directUpload: false,
    },
    sleep: async () => undefined,
  }

  const budget = { maxImages: 8, maxVideos: 3 }
  const { jobId, reserved } = await createMediaJob(db as never, {
    userId: USER,
    projectId: PROJECT,
    mode: opts.mode ?? "AUTO",
    scope: { kind: "site" },
    versionId: VERSION,
    plan: { items: opts.items, dropped: [], budget, budgetTier: "STANDARD" },
    budget,
    budgetTier: "STANDARD",
    mediaBrief: MEDIA_BRIEF,
    chargeBlueprint: false,
    config,
    enqueue: async () => undefined,
    baseMedia: {},
  })

  const job = async () => (await db.mediaJob.findUnique({ where: { id: jobId } }))!
  const balance = async () => ((await db.creditBalance.findUnique({ where: { userId: USER } }))!.balance as number)
  const act = async (action: CheckpointAction) => applyCheckpointAction(db as never, (await job()) as never, action, config)

  return { db, deps, jobId, reserved, job, balance, act, images, videoProvider, imageSemaphore, videoSemaphore, store }
}

export async function until<T>(read: () => Promise<T | null | undefined | false>, ms = 5000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > end) throw new Error("timed out waiting")
    await new Promise((r) => setTimeout(r, 5))
  }
}
