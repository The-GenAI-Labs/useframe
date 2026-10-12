import { createHash } from "node:crypto"
import { deflateSync } from "node:zlib"
import { MECHANISMS } from "../constants.js"
import type { Llm, LlmRequest, LlmResponse } from "../llm.js"
import { uuidFromKey } from "../hash.js"
import { ProviderError, type ImageProvider, type ImageResult, type VideoPollResult, type VideoProvider } from "./types.js"

// ---------------------------------------------------------------- PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// A real, decodable PNG: a soft two-tone gradient so palette/zone analysis has something to read.
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  const rows: Buffer[] = []
  for (let y = 0; y < height; y++) {
    const shade = 0.85 + 0.15 * (y / Math.max(1, height - 1))
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = Math.round(rgb[0] * shade)
      row[2 + x * 3] = Math.round(rgb[1] * shade)
      row[3 + x * 3] = Math.round(rgb[2] * shade)
    }
    rows.push(Buffer.from(row))
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function colorFor(text: string): [number, number, number] {
  const h = createHash("sha256").update(text).digest()
  return [64 + (h[0]! % 160), 64 + (h[1]! % 160), 64 + (h[2]! % 160)]
}

// ---------------------------------------------------------------- image

export type FakeImageOptions = {
  refuse?: (prompt: string) => boolean
  rejectSizes?: string[]
  failTimes?: number
}

export class FakeImageProvider implements ImageProvider {
  readonly calls: { kind: "generate" | "edit"; prompt: string; size: string; requestKey: string }[] = []
  private failures: number

  constructor(private readonly options: FakeImageOptions = {}) {
    this.failures = options.failTimes ?? 0
  }

  private make(kind: "generate" | "edit", prompt: string, size: string, requestKey: string): ImageResult {
    this.calls.push({ kind, prompt, size, requestKey })
    if (this.options.rejectSizes?.includes(size)) throw new ProviderError("INVALID_SIZE", `Fake: unsupported size ${size}`, 400)
    if (this.options.refuse?.(prompt)) throw new ProviderError("REFUSED", "Fake: moderation_blocked", 400)
    if (this.failures > 0) {
      this.failures--
      throw new ProviderError("TRANSIENT", "Fake: 503", 503)
    }
    const [w, h] = size.split("x").map(Number)
    return { bytes: solidPng(w!, h!, colorFor(prompt)), costUsd: 0, model: "fake-image" }
  }

  async generate(req: Parameters<ImageProvider["generate"]>[0]): Promise<ImageResult> {
    return this.make("generate", req.prompt, req.size, req.requestKey)
  }

  async edit(req: Parameters<ImageProvider["edit"]>[0]): Promise<ImageResult> {
    return this.make("edit", req.prompt, req.size, req.requestKey)
  }
}

// ---------------------------------------------------------------- video

export type FakeVideoOptions = {
  pollsUntilDone?: number
  outcome?: (prompt: string) => "SUCCEEDED" | "FAILED" | "REFUSED" | "NEVER"
}

export class FakeVideoProvider implements VideoProvider {
  readonly name = "fake"
  readonly model = "fake-video"
  readonly submits: { taskId: string; prompt: string; durationSec: number; hasLastFrame: boolean }[] = []
  private readonly tasks = new Map<string, { prompt: string; polls: number; delivered: boolean; results: number }>()

  constructor(private readonly options: FakeVideoOptions = {}) {}

  taskIdFor(requestKey: string): string {
    return uuidFromKey(requestKey)
  }

  async submit(req: Parameters<VideoProvider["submit"]>[0]): Promise<{ taskId: string }> {
    const taskId = req.taskId ?? this.taskIdFor(req.requestKey)
    if (!this.tasks.has(taskId)) {
      this.submits.push({ taskId, prompt: req.prompt, durationSec: req.durationSec, hasLastFrame: !!req.lastFrame })
      this.tasks.set(taskId, { prompt: req.prompt, polls: 0, delivered: !!req.deliverTo, results: req.results })
    }
    return { taskId }
  }

  async poll(taskId: string): Promise<VideoPollResult> {
    const task = this.tasks.get(taskId)
    if (!task) return { status: "FAILED", error: "TASK_NOT_FOUND" }
    task.polls++
    const outcome = this.options.outcome?.(task.prompt) ?? "SUCCEEDED"
    if (outcome === "NEVER" || task.polls < (this.options.pollsUntilDone ?? 1)) return { status: "RUNNING" }
    if (outcome === "REFUSED") return { status: "REFUSED", error: "Fake: content policy" }
    if (outcome === "FAILED") return { status: "FAILED", error: "Fake: generation failed" }
    return {
      status: "SUCCEEDED",
      costUsd: 0,
      outputs: Array.from({ length: task.results }, (_, i) => (task.delivered ? { delivered: true } : { url: `fake://video/${taskId}/${i}` })),
    }
  }
}

// ---------------------------------------------------------------- LLM

type Handler = (req: LlmRequest) => unknown

export function dataBlocks(text: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const m of text.matchAll(/<DATA name="([^"]+)">\n([\s\S]*?)\n<\/DATA>/g)) {
    try {
      out[m[1]!] = JSON.parse(m[2]!)
    } catch {
      out[m[1]!] = m[2]
    }
  }
  return out
}

const fakeVisualSystem = {
  lighting: "soft directional window light",
  lens: "50mm, shallow depth of field",
  texture: "matte paper and brushed metal",
  compositionRules: ["one clear subject", "generous negative space"],
  recurringMotif: "folded paper planes",
  colorUsage: "primary colour on hero objects, accent as small highlights",
  doNot: ["no busy backgrounds"],
}

const fakeNarrative = {
  storyArc: "From scattered effort to one calm, finished result.",
  visitorJourney: ["Notice the problem", "See the change", "Trust the result"],
  emotionalTone: "calm confidence",
}

type FakeSlot = { slotId: string; kinds: string[]; uploadOnly: boolean; aspect?: string; display?: string }

function fakeBlueprint(req: LlmRequest): unknown {
  const data = dataBlocks(req.prompt)
  const budget = /at most (\d+) images and (\d+) videos/.exec(req.prompt)
  let images = Number(budget?.[1] ?? 0)
  let videos = Number(budget?.[2] ?? 0)
  const full = req.prompt.includes("STRUCTURE instructions")
  const pages = [
    {
      type: "HOME",
      slug: "home",
      title: "Home",
      sections: ["HERO", "FEATURES", "HOW_IT_WORKS", "CTA", "FOOTER"].map((type, index) => ({ type, index })),
    },
  ]
  const slots: FakeSlot[] = full
    ? [
        { slotId: "home/hero-0/background", kinds: ["image", "video"], uploadOnly: false, display: "background" },
        { slotId: "home/how_it_works-2/item-0", kinds: ["image", "video"], uploadOnly: false, aspect: "16:9" },
        { slotId: "home/features-1/item-0", kinds: ["image", "video"], uploadOnly: false, aspect: "4:3" },
        { slotId: "home/cta-3/background", kinds: ["image", "video"], uploadOnly: false, display: "background" },
      ]
    : ((data.SLOTS as FakeSlot[] | undefined) ?? [])
  const mediaScript = slots
    .filter((s) => !s.uploadOnly)
    .flatMap((s, i) => {
      const kind = s.kinds.includes("video") && videos > 0 ? "video" : images > 0 && s.kinds.includes("image") ? "image" : null
      if (!kind) return []
      if (kind === "video") videos--
      else images--
      return [
        {
          itemId: `${kind}-${i + 1}`,
          slotId: s.slotId,
          kind,
          decision: "GENERATE",
          role: i === 0 ? "hook" : "show the transformation",
          intent: "Make the outcome feel effortless",
          subjectDirection: "A single paper plane gliding over a tidy desk",
          mood: ["calm"],
          aspect: s.aspect && s.aspect !== "any" ? s.aspect : "16:9",
          display: s.display === "background" ? "background" : "inline",
          textSafeZone: "left",
          ...(kind === "video" ? { video: { durationSec: 6, loopable: true, motionIntent: "slow glide", playWhen: "in_view" } } : {}),
          priority: i + 1,
          reason: "Sets the tone",
        },
      ]
    })
  return {
    narrative: fakeNarrative,
    visualSystem: fakeVisualSystem,
    mediaScript,
    ...(full ? { siteType: "SINGLE_PAGE", copyFramework: "AIDA", pages } : {}),
  }
}

function fakeConcepts(req: LlmRequest): unknown {
  const data = dataBlocks(req.prompt)
  const item = (data.MEDIA_ITEM ?? {}) as { durationSec?: number }
  const duration = item.durationSec ?? 5
  const usedLine = /already used by other videos on this site: ([^\n]*)\./.exec(req.system)?.[1] ?? ""
  const free = MECHANISMS.filter((m) => !usedLine.includes(m))
  return {
    concepts: (["A", "B", "C"] as const).map((id, i) => ({
      id,
      mechanism: free[i] ?? MECHANISMS[i],
      title: `Concept ${id}`,
      logline: `A quiet ${id} transformation that makes the result obvious`,
      whyItFits: "Shows the outcome without words, suited to a calm professional audience",
      openingFrame: "A scattered pile of paper on a clean desk, soft window light",
      endingFrame: "The papers have folded into one neat paper plane resting on the desk",
      beats: [
        { atSec: 0, change: "papers rest" },
        { atSec: Math.min(2, duration), change: "papers begin to fold" },
        { atSec: duration, change: "one paper plane rests" },
      ],
      camera: "slow push-in, one continuous shot",
      paletteUse: "primary paper, accent highlight",
      consistencyAnchors: ["desk", "paper colour"],
      loopable: false,
      risks: "folding motion may look unnatural",
      flags: { onScreenText: false, logoVisible: false, realPerson: false, brandNames: false },
    })),
  }
}

const DEFAULTS: Record<string, Handler> = {
  blueprint: fakeBlueprint,
  "media.concepts": fakeConcepts,
  "media.judge": (req) => {
    const concepts = (dataBlocks(req.prompt).CONCEPTS as { id: "A" | "B" | "C" }[] | undefined) ?? []
    return {
      scores: concepts.map((c, i) => ({
        id: c.id,
        messageFit: 8 - i,
        audienceFit: 8 - i,
        memorability: 7 - i,
        feasibility: 8 - i,
        brandFit: 7,
        veto: false,
        comment: "clear and feasible",
      })),
      winnerId: concepts[0]?.id ?? "A",
      directorNotes: ["Keep the camera slower in the last second"],
      reason: "Clearest idea with the lowest risk",
    }
  },
  "media.frames": (req) => {
    const frame = dataBlocks(req.prompt).FRAME as { endingFrameWanted?: boolean } | undefined
    return {
      openingPrompt: "A scattered pile of paper on a clean desk, soft light, calm area on the left, no text, no logos",
      ...(frame?.endingFrameWanted ? { endingPrompt: "Same scene, same desk and paper, now folded into one paper plane" } : {}),
    }
  },
  "media.image_prompts": (req) => {
    const items = (dataBlocks(req.prompt).ITEMS as { itemId: string }[] | undefined) ?? []
    return { prompts: items.map((i) => ({ itemId: i.itemId, prompt: `A calm still life for ${i.itemId}, no text, no logos` })) }
  },
  "media.image_qa": (req) => ({
    matchesIntent: true,
    paletteAdherence: 4,
    hasReadableText: false,
    hasLogoOrBrand: false,
    hasRealisticPerson: false,
    hasDistortion: false,
    textZoneClear: true,
    safe: true,
    ...(req.system.includes("identityMatchesOpening") ? { identityMatchesOpening: 5 } : {}),
    altText: "Folded paper resting on a sunlit desk",
  }),
  "media.video_prompt": (req) => {
    const duration = Number(/Start from (\d+) seconds/.exec(req.system)?.[1] ?? 5)
    return {
      mode: req.system.includes("and ending frame") ? "FIRST_AND_LAST" : "FIRST_ONLY",
      durationSec: duration,
      prompt: "Papers fold into a paper plane. One continuous shot, no cuts. No text, no logos.",
      loop: false,
      notes: "steady push-in",
    }
  },
  "media.video_qa": () => ({
    startMatchesOpening: true,
    endMatchesEnding: true,
    consistentSubject: true,
    hasText: false,
    hasLogo: false,
    motionPlausible: true,
    notes: "consistent",
  }),
  "media.revise": (req) => ({ prompt: `${String(dataBlocks(req.prompt).PROMPT ?? "")} (revised)` }),
  "media.soften": (req) => ({ prompt: `${String(dataBlocks(req.prompt).PROMPT ?? "")} (softened)` }),
}

// Deterministic stand-in for every Claude call in the media pipeline.
export class FakeLlm implements Llm {
  readonly calls: LlmRequest[] = []

  constructor(private readonly overrides: Partial<Record<string, Handler>> = {}) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req)
    const handler = this.overrides[req.purpose] ?? DEFAULTS[req.purpose]
    if (!handler) throw new Error(`FakeLlm has no response for ${req.purpose}`)
    const out = handler(req)
    if (out && typeof out === "object" && "refused" in (out as object)) return out as LlmResponse
    return { text: typeof out === "string" ? out : JSON.stringify(out), costUsd: 0 }
  }
}
