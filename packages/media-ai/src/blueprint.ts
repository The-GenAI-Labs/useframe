import { briefStateOf, type prisma, type Prisma } from "@useframe/db"
import { toLlmSafeView, type MediaMenuItem, type SiteSpec } from "@repo/schemas"
import { isUploadOnlyPurpose, nearestAspect, SECTION_MEDIA_SLOTS, type BindableAsset } from "@repo/site-builder"
import type { MediaBudgetTier, MediaMode } from "./constants.js"
import type { Budget, MediaAiConfig } from "./config.js"
import { estimateJobCost } from "./cost.js"
import { briefHash } from "./hash.js"
import { costItems } from "./jobs.js"
import { parseJsonObject, repairNote, type Llm } from "./llm.js"
import { planningSlots, validateMediaScript } from "./mediaScript.js"
import { offPaletteColors } from "./palette.js"
import { blueprintPrompt } from "./prompts/index.js"
import {
  BlueprintFullOutputSchema,
  BlueprintMediaOutputSchema,
  PersistedBlueprintSchema,
  type MediaBrief,
  type MediaItem,
  type PersistedBlueprint,
} from "./schemas.js"
import type { ResearchForMedia } from "./brief.js"

type Pages = SiteSpec["pages"]

export type BlueprintSite = {
  pages: Pages
  copyFramework: string
  tokens: { colors: string[]; fonts: string[]; styleTags: string[] }
}

export type UploadedMenu = { items: MediaMenuItem[]; assets: Map<string, BindableAsset> }

export type StructureResult = { pages: Pages; siteType: SiteSpec["siteType"]; copyFramework: SiteSpec["copyFramework"] }

export type RunSiteBlueprintInput = {
  mode: "brief" | "full" | "media-only"
  llm: Llm
  // brief and media-only: the fixed site the blueprint must not change.
  site?: BlueprintSite
  // full: the structure agent's own prompt and validation.
  structure?: { prompt: string; parse: (raw: unknown) => { ok: true; value: StructureResult } | { ok: false; errors: string[] } }
  palette: string[]
  mediaBrief: MediaBrief
  briefFacts: unknown
  research: unknown
  uploaded: UploadedMenu
  budget: Budget
  config: MediaAiConfig
  mediaNotes?: string
  generatedAllowance?: number
  // Re-run scoped to some slots: items for any other slot are invalid.
  slotIds?: string[]
}

export type SiteBlueprintResult =
  | { ok: true; blueprint: PersistedBlueprint; structure?: StructureResult; attempts: number; costUsd: number }
  | { ok: false; errors: string[]; attempts: number; costUsd: number }

function slotMenu(pages: Pages, slotIds?: string[]) {
  return planningSlots(pages)
    .filter((ref) => !slotIds || slotIds.includes(ref.slotId))
    .map(({ slotId, section, slot }) => ({
      slotId,
      section: section.type,
      purpose: slot.purpose,
      kinds: slot.kinds,
      aspect: slot.aspect ?? "any",
      display: slot.display,
      uploadOnly: isUploadOnlyPurpose(slot.purpose),
    }))
}

// Every section type's slots, for the full mode where sections are not chosen yet.
function registryMenu() {
  return Object.entries(SECTION_MEDIA_SLOTS).map(([type, def]) => ({
    sectionType: type,
    slotIdPattern: `{pageSlug}/${type.toLowerCase()}-{sectionIndex}/{slotKey}`,
    slots: [...(def.slots ?? []), ...(def.itemSlot ? [{ ...def.itemSlot, key: "item-{n} (n = 0, 1, 2)" }] : [])].map((s) => ({
      key: s.key,
      purpose: s.purpose,
      kinds: s.kinds,
      aspect: s.aspect ?? "any",
      display: s.display,
      uploadOnly: isUploadOnlyPurpose(s.purpose),
    })),
  }))
}

// One function for all three blueprint cases. The brief/media-only output can
// only add narrative, visualSystem and mediaScript; pages are never read from it.
export async function runSiteBlueprint(input: RunSiteBlueprintInput): Promise<SiteBlueprintResult> {
  const full = input.mode === "full"
  if (full && !input.structure) throw new Error("full mode needs the structure prompt and parser")
  if (!full && !input.site) throw new Error(`${input.mode} mode needs the fixed site`)
  const { system, prompt } = blueprintPrompt({
    mode: input.mode,
    budget: input.budget,
    site: full ? { allowedColors: input.palette } : input.site,
    slots: full ? registryMenu() : slotMenu(input.site!.pages, input.slotIds),
    uploadedMenu: input.uploaded.items,
    mediaBrief: input.mediaBrief,
    briefFacts: input.briefFacts,
    research: input.research,
    mediaNotes: input.mediaNotes,
    structurePrompt: input.structure?.prompt,
  })

  let errors: string[] = []
  let costUsd = 0
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await input.llm.complete({
      routingKey: "blueprint",
      system,
      prompt: attempt === 1 ? prompt : prompt + repairNote(errors),
      maxTokens: 32_000,
      purpose: "blueprint",
    })
    costUsd += res.costUsd ?? 0
    const fatal: string[] = []
    const raw = res.refused ? null : parseJsonObject(res.text)
    if (res.refused) fatal.push("the model declined the request")
    else if (raw === null) fatal.push("the answer was not a JSON object")

    const parsed = raw === null ? null : (full ? BlueprintFullOutputSchema : BlueprintMediaOutputSchema).safeParse(raw)
    if (parsed && !parsed.success) {
      fatal.push(...parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "root"}: ${i.message}`))
    }
    let structure: StructureResult | undefined
    if (parsed?.success && full) {
      const s = input.structure!.parse(raw)
      if (s.ok) structure = s.value
      else fatal.push(...s.errors)
    }
    if (parsed?.success) {
      const off = offPaletteColors(parsed.data.visualSystem, input.palette)
      if (off.length) fatal.push(`visualSystem introduces colours outside the palette: ${off.join(", ")}`)
    }

    const pages = full ? structure?.pages : input.site!.pages
    const script =
      parsed?.success && pages
        ? validateMediaScript(
            (parsed.data.mediaScript as unknown[]).filter(
              (item) => !input.slotIds || input.slotIds.includes(String((item as { slotId?: unknown })?.slotId)),
            ),
            {
              pages,
              uploaded: input.uploaded.assets,
              budget: input.budget,
              config: input.config,
              generatedAllowance: input.generatedAllowance,
            },
          )
        : null
    if (input.slotIds && parsed?.success) {
      for (const item of parsed.data.mediaScript as { slotId?: unknown; itemId?: unknown }[]) {
        if (!input.slotIds.includes(String(item?.slotId))) fatal.push(`${String(item?.itemId)}: slot ${String(item?.slotId)} is outside the requested slots`)
      }
    }

    const itemErrors = script?.errors ?? []
    if (fatal.length === 0 && (itemErrors.length === 0 || attempt === 2) && parsed?.success && script) {
      const copyFramework = full ? structure!.copyFramework : input.site!.copyFramework
      const blueprint = PersistedBlueprintSchema.parse({
        version: 1,
        mode: input.mode,
        briefHash: briefHash(pages!, copyFramework),
        narrative: parsed.data.narrative,
        visualSystem: parsed.data.visualSystem,
        mediaScript: script.items,
        dropped: [...script.dropped, ...itemErrors.map((e) => ({ itemId: e.split(/[ :]/)[0] ?? "item", reason: `invalid: ${e}` }))],
        createdAt: new Date().toISOString(),
      })
      return { ok: true, blueprint, ...(structure ? { structure } : {}), attempts: attempt, costUsd }
    }
    errors = [...fatal, ...itemErrors]
  }
  return { ok: false, errors, attempts: 2, costUsd }
}

export function isBlueprintFresh(blueprint: PersistedBlueprint | null, pages: Pages, copyFramework: string): boolean {
  return !!blueprint && !blueprint.stale && blueprint.briefHash === briefHash(pages, copyFramework)
}

export function readBlueprint(value: unknown): PersistedBlueprint | null {
  const parsed = PersistedBlueprintSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// What the site carries when the blueprint was skipped: a one-line notice for the Media tab.
export type BlueprintNotice = { status: "skipped"; notice: string; createdAt: string }

export function readBlueprintNotice(value: unknown): BlueprintNotice | null {
  const v = value as Partial<BlueprintNotice> | null
  return v?.status === "skipped" && typeof v.notice === "string" ? (v as BlueprintNotice) : null
}

// Drops the least important generated items until the plan fits the balance.
export function fitPlanToBalance(
  items: MediaItem[],
  balance: number,
  config: MediaAiConfig,
  opts: { blueprint: boolean },
): { items: MediaItem[]; dropped: { itemId: string; reason: string }[] } {
  let kept = [...items]
  const dropped: { itemId: string; reason: string }[] = []
  while (estimateJobCost(costItems(kept), config, opts).credits > balance) {
    const victim = kept.filter((i) => i.decision === "GENERATE").sort((a, b) => b.priority - a.priority)[0]
    if (!victim) break
    kept = kept.filter((i) => i !== victim)
    dropped.push({ itemId: victim.itemId, reason: "not enough credits" })
  }
  return { items: kept, dropped }
}

// ---------------------------------------------------------------- data loading

type LoaderDb = Pick<typeof prisma, "researchReport" | "researchReportCitation" | "styleTag" | "mediaAsset" | "projectBrief" | "project">

export type BlueprintInputs = {
  research: (ResearchForMedia & { styleTagKeys: string[] }) | null
  imageryFindingIds: string[]
  styleAvoid: string[]
  uploaded: UploadedMenu
  hasProductPhotoUploads: boolean
  briefFacts: ReturnType<typeof toLlmSafeView> | null
  media: { mode: MediaMode; budgetTier: MediaBudgetTier; notes?: string }
  project: { startupIdea: string; targetAudience: string; niche: string | null }
}

const PURPOSES = new Set<string>(["hero_visual", "hero_video", "section_video", "section_illustration", "feature_visual", "background", "cta_background", "gallery_item", "logo", "avatar", "team_photo", "product_screenshot", "customer_logo"])

export function mediaSettingsOf(data: Record<string, unknown> | null | undefined, paid: boolean): BlueprintInputs["media"] {
  const mode = data?.mediaMode === "AUTO" || data?.mediaMode === "MANUAL" || data?.mediaMode === "OFF" ? data.mediaMode : paid ? "AUTO" : "OFF"
  const tier = ["IMAGES_ONLY", "LIGHT", "STANDARD", "RICH"].includes(String(data?.mediaBudget)) ? (data!.mediaBudget as MediaBudgetTier) : "STANDARD"
  const notes = typeof data?.mediaNotes === "string" && data.mediaNotes.trim() ? data.mediaNotes.trim().slice(0, 300) : undefined
  return { mode: paid ? mode : "OFF", budgetTier: tier, ...(notes ? { notes } : {}) }
}

export async function loadBlueprintInputs(db: LoaderDb, projectId: string, userId: string, paid: boolean): Promise<BlueprintInputs> {
  const [project, report, assets, brief] = await Promise.all([
    db.project.findFirst({ where: { id: projectId, userId }, select: { startupIdea: true, targetAudience: true, niche: true } }),
    db.researchReport.findUnique({ where: { projectId } }),
    db.mediaAsset.findMany({
      where: { projectId, userId, deletedAt: null, status: "READY" },
      select: { id: true, kind: true, origin: true, width: true, height: true, durationMs: true, description: true, altText: true, suggestedPurposes: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.projectBrief.findFirst({ where: { projectId, userId, status: "APPROVED" } }),
  ])
  if (!project) throw new Error("Project not found")
  const [citations, tags] = report
    ? await Promise.all([
        db.researchReportCitation.findMany({ where: { researchReportId: report.id, decisionArea: "IMAGERY" }, select: { findingId: true }, take: 20 }),
        report.styleTagKeys.length
          ? db.styleTag.findMany({ where: { key: { in: report.styleTagKeys } }, select: { avoidPatterns: true } })
          : Promise.resolve([]),
      ])
    : [[], []]

  const items: MediaMenuItem[] = []
  const map = new Map<string, BindableAsset>()
  for (const a of assets) {
    const purposes = Array.isArray(a.suggestedPurposes) ? a.suggestedPurposes.filter((p): p is MediaMenuItem["suggestedPurposes"][number] => typeof p === "string" && PURPOSES.has(p)) : []
    items.push({
      assetId: a.id,
      kind: a.kind === "VIDEO" ? "video" : "image",
      aspect: nearestAspect(a.width, a.height),
      width: a.width,
      height: a.height,
      ...(a.durationMs ? { durationSec: Math.round(a.durationMs / 100) / 10 } : {}),
      description: a.description,
      altText: a.altText,
      suggestedPurposes: purposes,
      origin: a.origin === "GENERATED" ? "generated" : "uploaded",
    })
    map.set(a.id, { id: a.id, kind: a.kind, origin: a.origin, status: "READY", deleted: false, width: a.width, height: a.height })
  }
  const state = brief ? briefStateOf(brief) : null
  const data = (state?.data ?? null) as Record<string, unknown> | null
  return {
    research: report
      ? {
          primaryColor: report.primaryColor,
          secondaryColor: report.secondaryColor,
          accentColor: report.accentColor,
          colorPalette: report.colorPalette,
          imageStyle: report.imageStyle,
          imageDirection: report.imageDirection,
          animationStyle: report.animationStyle,
          targetAgeGroup: report.targetAgeGroup,
          toneOfVoice: report.toneOfVoice,
          competitorInsights: report.competitorInsights,
          styleTagKeys: report.styleTagKeys,
        }
      : null,
    imageryFindingIds: citations.map((c) => c.findingId),
    styleAvoid: tags.flatMap((t) => t.avoidPatterns),
    uploaded: { items, assets: map },
    hasProductPhotoUploads: data?.productType === "PHYSICAL_PRODUCT" && assets.some((a) => a.kind === "IMAGE" && a.origin === "UPLOADED"),
    briefFacts: state ? toLlmSafeView(state.data) : null,
    media: mediaSettingsOf(data, paid),
    project,
  }
}

// ---------------------------------------------------------------- applying bindings

type ApplyDb = Pick<typeof prisma, "projectVersion" | "project" | "$transaction">

// A new version whose SiteSpec equals the base one with only `media` replaced
// (or, for a slot-scoped re-run, only those slots).
export async function applyMediaBindings(
  db: ApplyDb,
  input: { projectId: string; baseVersionId: string; bindings: Record<string, unknown>; onlySlots?: string[]; label: string },
): Promise<{ versionId: string } | null> {
  return db.$transaction(async (tx) => {
    const base = await tx.projectVersion.findFirst({
      where: { id: input.baseVersionId, projectId: input.projectId },
      select: { id: true, snapshot: true, siteType: true, seo: true, designBrief: true, blueprint: true, briefRevisionId: true },
    })
    const snapshot = base?.snapshot as Record<string, unknown> | null
    if (!base || !snapshot || !Array.isArray(snapshot.pages)) return null
    const previous = (snapshot.media ?? {}) as Record<string, unknown>
    const media = input.onlySlots
      ? { ...Object.fromEntries(Object.entries(previous).filter(([slot]) => !input.onlySlots!.includes(slot))), ...input.bindings }
      : input.bindings
    if (JSON.stringify(media) === JSON.stringify(previous)) return { versionId: base.id }
    const latest = await tx.projectVersion.findFirst({
      where: { projectId: input.projectId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    })
    const created = await tx.projectVersion.create({
      data: {
        projectId: input.projectId,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        label: input.label,
        siteType: base.siteType,
        seo: base.seo as Prisma.InputJsonValue,
        ...(base.designBrief ? { designBrief: base.designBrief as Prisma.InputJsonValue } : {}),
        ...(base.blueprint ? { blueprint: base.blueprint as Prisma.InputJsonValue } : {}),
        ...(base.briefRevisionId ? { briefRevisionId: base.briefRevisionId } : {}),
        parentVersionId: base.id,
        triggeredBy: "media",
        snapshot: { ...snapshot, media } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    await tx.project.updateMany({
      where: { id: input.projectId, currentVersionId: base.id },
      data: { currentVersionId: created.id },
    })
    return { versionId: created.id }
  })
}
