import { z } from "zod"
import { ASPECTS, CHECKPOINTS, MECHANISMS, MEDIA_BUDGET_TIERS, MEDIA_MODES } from "./constants.js"

const text = (max: number) => z.string().trim().min(1).max(max)
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length

export const MediaModeSchema = z.enum(MEDIA_MODES)
export const MediaBudgetTierSchema = z.enum(MEDIA_BUDGET_TIERS)
export const AspectSchema = z.enum(ASPECTS)
export const MechanismSchema = z.enum(MECHANISMS)
export const TextSafeZoneSchema = z.enum(["left", "right", "center", "none"])

export const NarrativeSchema = z
  .object({
    storyArc: text(700),
    visitorJourney: z.array(text(160)).min(1).max(6),
    emotionalTone: text(160),
  })
  .refine(
    (n) => wordCount([n.storyArc, ...n.visitorJourney, n.emotionalTone].join(" ")) <= 120,
    "narrative must be 120 words or fewer in total",
  )
export type Narrative = z.infer<typeof NarrativeSchema>

export const VisualSystemSchema = z.object({
  lighting: text(200),
  lens: text(200),
  texture: text(200),
  compositionRules: z.array(text(200)).min(1).max(6),
  recurringMotif: text(200),
  colorUsage: text(300),
  doNot: z.array(text(160)).max(10),
})
export type VisualSystem = z.infer<typeof VisualSystemSchema>

export const MediaItemSchema = z.object({
  itemId: z.string().regex(/^[a-z0-9_:-]{1,40}$/i),
  slotId: z.string().min(1).max(200),
  kind: z.enum(["image", "video"]),
  decision: z.enum(["USE_UPLOADED", "GENERATE"]),
  assetId: z.string().min(1).max(64).optional(),
  referenceAssetIds: z.array(z.string().min(1).max(64)).max(2).optional(),
  role: text(80),
  intent: text(240),
  subjectDirection: text(400),
  mood: z.array(text(40)).max(5),
  aspect: AspectSchema,
  display: z.enum(["background", "inline"]),
  textSafeZone: TextSafeZoneSchema.optional(),
  allowPeople: z.boolean().optional(),
  video: z
    .object({
      durationSec: z.number(),
      loopable: z.boolean(),
      motionIntent: text(240),
      playWhen: z.enum(["load", "in_view"]),
    })
    .optional(),
  priority: z.number().int().min(1).max(99),
  reason: text(300),
})
export type MediaItem = z.infer<typeof MediaItemSchema>

// What runSiteBlueprint asks for in the brief and media-only modes.
export const BlueprintMediaOutputSchema = z.object({
  narrative: NarrativeSchema,
  visualSystem: VisualSystemSchema,
  // Items are validated one by one in code so a single bad item can be stripped.
  mediaScript: z.array(z.unknown()).max(40),
})

const PageTypeSchema = z.enum(["HOME", "ABOUT", "CONTACT", "PRICING", "PRODUCT", "RESEARCH", "DEMO"])

// The "full" mode also designs the pages, exactly like the structure agent.
export const BlueprintFullOutputSchema = BlueprintMediaOutputSchema.extend({
  siteType: z.enum(["SINGLE_PAGE", "MULTI_PAGE"]),
  copyFramework: z.enum(["AIDA", "PAS", "FAB", "PASTOR"]),
  pages: z
    .array(
      z.object({
        type: PageTypeSchema,
        slug: z.string().min(1).max(60),
        title: z.string().min(1).max(120),
        sections: z.array(z.object({ type: z.string(), index: z.number().int().min(0) })).min(1).max(12),
      }),
    )
    .min(1)
    .max(4),
})

export const PersistedBlueprintSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["brief", "full", "media-only"]),
  briefHash: z.string(),
  narrative: NarrativeSchema,
  visualSystem: VisualSystemSchema,
  mediaScript: z.array(MediaItemSchema),
  dropped: z.array(z.object({ itemId: z.string(), reason: z.string() })),
  createdAt: z.string(),
  stale: z.boolean().optional(),
})
export type PersistedBlueprint = z.infer<typeof PersistedBlueprintSchema>

export const MediaBriefSchema = z.object({
  subject: text(400),
  audience: z.object({
    ageGroup: z.string().max(60).optional(),
    segment: z.enum(["B2B", "B2C", "BOTH"]).optional(),
    industry: z.string().max(80).optional(),
    techLevel: z.string().max(20).optional(),
  }),
  message: text(400),
  mood: z.array(text(60)).max(8),
  palette: z.object({
    primary: z.string().regex(/^#[0-9a-f]{6}$/i),
    secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    neutrals: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(6),
  }),
  styleDirection: text(800),
  motionStyle: z.string().max(200).optional(),
  researchFindingIds: z.array(z.string()).max(20),
  avoid: z.array(text(160)).max(40),
  userNotes: z.string().max(300).optional(),
  budget: z.object({ maxImages: z.number().int().min(0), maxVideos: z.number().int().min(0) }),
  hasProductPhotoUploads: z.boolean(),
  blueprint: z.object({ narrative: z.string().max(1500), visualSystem: VisualSystemSchema }).optional(),
})
export type MediaBrief = z.infer<typeof MediaBriefSchema>

export const ConceptSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  mechanism: MechanismSchema,
  title: text(60),
  logline: text(240),
  whyItFits: text(300),
  openingFrame: text(500),
  endingFrame: text(500),
  beats: z.array(z.object({ atSec: z.number().min(0), change: text(240) })).min(2).max(6),
  camera: text(160),
  paletteUse: text(300),
  consistencyAnchors: z.array(text(120)).min(1).max(6),
  loopable: z.boolean(),
  risks: text(300),
  flags: z.object({
    onScreenText: z.boolean(),
    logoVisible: z.boolean(),
    realPerson: z.boolean(),
    brandNames: z.boolean(),
  }),
})
export type Concept = z.infer<typeof ConceptSchema>

export const ConceptSetSchema = z.object({ concepts: z.array(z.unknown()).min(1).max(3) })

export const JudgeScoreSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  messageFit: z.number().min(0).max(10),
  audienceFit: z.number().min(0).max(10),
  memorability: z.number().min(0).max(10),
  feasibility: z.number().min(0).max(10),
  brandFit: z.number().min(0).max(10),
  veto: z.boolean(),
  vetoReason: z.string().max(300).optional(),
  comment: z.string().max(400),
})
export type JudgeScore = z.infer<typeof JudgeScoreSchema>

export const JudgeOutputSchema = z.object({
  scores: z.array(JudgeScoreSchema).min(1).max(3),
  winnerId: z.enum(["A", "B", "C"]),
  directorNotes: z.array(text(240)).max(5),
  reason: z.string().max(400),
})
export type JudgeOutput = z.infer<typeof JudgeOutputSchema>

export const FramePromptsSchema = z.object({
  openingPrompt: text(4000),
  endingPrompt: text(4000).optional(),
})
export type FramePrompts = z.infer<typeof FramePromptsSchema>

export const ImagePromptBatchSchema = z.object({
  prompts: z.array(z.object({ itemId: z.string(), prompt: text(4000) })).min(1).max(30),
})

export const ImageQaSchema = z.object({
  matchesIntent: z.boolean(),
  paletteAdherence: z.number().min(0).max(5),
  hasReadableText: z.boolean(),
  hasLogoOrBrand: z.boolean(),
  hasRealisticPerson: z.boolean(),
  hasDistortion: z.boolean(),
  textZoneClear: z.boolean(),
  safe: z.boolean(),
  identityMatchesOpening: z.number().min(0).max(5).optional(),
  altText: text(125),
  promptFix: z.string().max(600).optional(),
})
export type ImageQa = z.infer<typeof ImageQaSchema>

export const VideoPromptSchema = z.object({
  mode: z.enum(["FIRST_AND_LAST", "FIRST_ONLY"]),
  durationSec: z.number(),
  prompt: text(7000),
  loop: z.boolean(),
  notes: z.string().max(600),
})
export type VideoPrompt = z.infer<typeof VideoPromptSchema>

export const VideoQaSchema = z.object({
  startMatchesOpening: z.boolean(),
  endMatchesEnding: z.boolean(),
  consistentSubject: z.boolean(),
  hasText: z.boolean(),
  hasLogo: z.boolean(),
  motionPlausible: z.boolean(),
  loopSeamOk: z.boolean().optional(),
  notes: z.string().max(600),
  promptFix: z.string().max(600).optional(),
})
export type VideoQa = z.infer<typeof VideoQaSchema>

export const PromptRewriteSchema = z.object({ prompt: text(7000) })

export const CheckpointSchema = z.enum(CHECKPOINTS)

export const CheckpointActionSchema = z.object({
  checkpoint: CheckpointSchema,
  action: z.enum(["pick", "approve", "regenerate", "skip", "drop"]),
  itemId: z.string().max(40).optional(),
  conceptId: z.enum(["A", "B", "C"]).optional(),
  candidateId: z.string().max(64).optional(),
  candidates: z.number().int().min(1).max(3).optional(),
  note: z.string().trim().max(300).optional(),
})
export type CheckpointAction = z.infer<typeof CheckpointActionSchema>

export const StartJobSchema = z.object({
  mode: z.enum(["AUTO", "MANUAL"]),
  scope: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("site") }),
    z.object({ kind: z.literal("slots"), slotIds: z.array(z.string().max(200)).min(1).max(30) }),
  ]),
})
export type StartJobInput = z.infer<typeof StartJobSchema>
