import { generateText, type LanguageModelV1 } from "ai"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { MEDIA_PURPOSES, MediaBindingSchema, type MediaBinding, type MediaMenuItem, type MediaPurpose, type SiteSpec } from "@repo/schemas"
import {
  isUploadOnlyPurpose,
  listMediaSlots,
  nearestAspect,
  validateMediaBindings,
  type BindableAsset,
  type RejectedBinding,
} from "@repo/site-builder"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import { parseJsonObject } from "@/agents/briefPrefill.agent.js"
import { MEDIA_PLACEMENT_PROMPT, MEDIA_PLACEMENT_SYSTEM } from "@/prompts/media.prompt.js"

const MENU_LIMIT = 60

export type AssetMenu = { items: MediaMenuItem[]; assets: Map<string, BindableAsset> }

const PURPOSES = new Set<string>(MEDIA_PURPOSES)

// The closed menu: READY, non-deleted assets of this project (and of userId, when given).
export async function loadAssetMenu(projectId: string, userId?: string): Promise<AssetMenu> {
  const rows = await prisma.mediaAsset.findMany({
    where: { projectId, deletedAt: null, status: "READY", ...(userId ? { userId } : {}) },
    select: {
      id: true,
      kind: true,
      origin: true,
      width: true,
      height: true,
      durationMs: true,
      description: true,
      altText: true,
      suggestedPurposes: true,
    },
    orderBy: { createdAt: "desc" },
    take: MENU_LIMIT,
  })
  const items: MediaMenuItem[] = []
  const assets = new Map<string, BindableAsset>()
  for (const row of rows) {
    const purposes = Array.isArray(row.suggestedPurposes)
      ? row.suggestedPurposes.filter((p): p is MediaPurpose => typeof p === "string" && PURPOSES.has(p))
      : []
    items.push({
      assetId: row.id,
      kind: row.kind === "VIDEO" ? "video" : "image",
      aspect: nearestAspect(row.width, row.height),
      width: row.width,
      height: row.height,
      ...(row.durationMs ? { durationSec: Math.round(row.durationMs / 100) / 10 } : {}),
      description: row.description,
      altText: row.altText,
      suggestedPurposes: purposes,
      origin: row.origin === "GENERATED" ? "generated" : "uploaded",
    })
    assets.set(row.id, {
      id: row.id,
      kind: row.kind,
      origin: row.origin,
      status: "READY",
      deleted: false,
      width: row.width,
      height: row.height,
    })
  }
  return { items, assets }
}

const ProposedBindingSchema = MediaBindingSchema.extend({ slotId: z.string().max(200) })

// Each binding is checked on its own, so one malformed entry does not void the rest.
function parseBindings(text: string): Record<string, MediaBinding> {
  const raw = (parseJsonObject(text) as { bindings?: unknown } | null)?.bindings
  const out: Record<string, MediaBinding> = {}
  for (const entry of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    const parsed = ProposedBindingSchema.safeParse(entry)
    if (!parsed.success) continue
    const { slotId, ...binding } = parsed.data
    out[slotId] = binding
  }
  return out
}

// Drops every binding that is not on the menu or does not fit its slot.
export function sanitizeMediaBindings(
  spec: Pick<SiteSpec, "pages" | "media">,
  menu: AssetMenu,
): { media: Record<string, MediaBinding>; rejected: RejectedBinding[] } {
  const { valid, rejected } = validateMediaBindings(spec, menu.assets)
  return { media: valid, rejected }
}

export type PlacementInput = {
  spec: Pick<SiteSpec, "pages" | "media">
  menu: AssetMenu
  model: LanguageModelV1
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>
  instruction?: string
}

export async function runMediaPlacement(input: PlacementInput): Promise<Record<string, MediaBinding>> {
  const existing = sanitizeMediaBindings(input.spec, input.menu).media
  const slots = listMediaSlots(input.spec)
  if (input.menu.items.length === 0 || slots.length === 0) return existing

  const slotData = slots.map(({ slotId, section, slot }) => ({
    slotId,
    section: section.type,
    headline: section.content?.headline?.slice(0, 120),
    purpose: slot.purpose,
    kinds: slot.kinds,
    aspect: slot.aspect ?? "any",
    display: slot.display,
    uploadOnly: isUploadOnlyPurpose(slot.purpose),
    current: existing[slotId]?.assetId ?? null,
  }))

  const ask = async (rejected: RejectedBinding[]): Promise<Record<string, MediaBinding> | null> => {
    try {
      const { text } = await generateText({
        model: input.model,
        system: MEDIA_PLACEMENT_SYSTEM,
        prompt: MEDIA_PLACEMENT_PROMPT({ slots: slotData, menu: input.menu.items, instruction: input.instruction, rejected }),
        maxTokens: 1500,
        providerOptions: input.providerOptions,
        abortSignal: AbortSignal.timeout(60_000),
        experimental_telemetry: { isEnabled: true, functionId: "media-placement" },
      })
      return parseBindings(text)
    } catch (err) {
      console.warn("[media-placement] model call failed", err instanceof Error ? err.message : err)
      return null
    }
  }

  const proposed = await ask([])
  if (!proposed) return existing
  // The answer replaces the previous bindings wholesale, so it can also clear a slot.
  const first = sanitizeMediaBindings({ pages: input.spec.pages, media: proposed }, input.menu)
  if (first.rejected.length === 0) return first.media

  // One retry, and only for the slots that were rejected; anything still invalid is dropped.
  const retry = await ask(first.rejected)
  const retrySlots = new Set(first.rejected.map((r) => r.slotId))
  const fixes = retry
    ? Object.fromEntries(
        Object.entries(sanitizeMediaBindings({ pages: input.spec.pages, media: retry }, input.menu).media).filter(
          ([slotId]) => retrySlots.has(slotId),
        ),
      )
    : {}
  return { ...first.media, ...fixes }
}
