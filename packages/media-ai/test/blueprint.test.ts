import { describe, expect, it } from "vitest"
import { isBlueprintFresh, runSiteBlueprint, type RunSiteBlueprintInput } from "../src/blueprint.js"
import { briefHash } from "../src/hash.js"
import type { Llm, LlmRequest } from "../src/llm.js"
import { FakeLlm } from "../src/providers/fake.js"
import { config, mediaBrief, PALETTE, pages } from "./helpers.js"

type Out = Record<string, unknown> & { visualSystem: Record<string, unknown>; mediaScript: Record<string, unknown>[] }

// Wraps the default fake blueprint so a test can tweak each attempt's answer.
function tweakedLlm(tweak: (out: Out, attempt: number) => Out | string): Llm & { calls: LlmRequest[] } {
  const base = new FakeLlm()
  const calls: LlmRequest[] = []
  return {
    calls,
    async complete(req) {
      calls.push(req)
      const res = await base.complete(req)
      const out = tweak(JSON.parse(res.text) as Out, calls.length)
      return { text: typeof out === "string" ? out : JSON.stringify(out), costUsd: 0 }
    },
  }
}

function input(llm: Llm, overrides: Partial<RunSiteBlueprintInput> = {}): RunSiteBlueprintInput {
  return {
    mode: "brief",
    llm,
    site: { pages: pages(), copyFramework: "AIDA", tokens: { colors: PALETTE, fonts: ["Inter"], styleTags: [] } },
    palette: PALETTE,
    mediaBrief,
    briefFacts: { productName: "Ledgerly" },
    research: null,
    uploaded: { items: [], assets: new Map() },
    budget: { maxImages: 4, maxVideos: 1 },
    config,
    ...overrides,
  }
}

describe("runSiteBlueprint (brief path)", () => {
  it("never changes sections or copy, even when the model returns pages", async () => {
    const site = input(new FakeLlm()).site!
    const before = structuredClone(site.pages)
    const llm = tweakedLlm((out) => ({
      ...out,
      copyFramework: "PAS",
      pages: [{ type: "HOME", slug: "home", title: "Home", sections: [{ type: "PRICING", index: 0 }] }],
    }))
    const res = await runSiteBlueprint(input(llm, { site }))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.structure).toBeUndefined()
    expect(site.pages).toEqual(before)
    expect(res.blueprint.briefHash).toBe(briefHash(before, "AIDA"))
    expect(Object.keys(res.blueprint).sort()).toEqual(["briefHash", "createdAt", "dropped", "mediaScript", "mode", "narrative", "version", "visualSystem"])
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]!.routingKey).toBe("blueprint")
  })

  it("rejects an off-palette visualSystem and retries once with the exact error", async () => {
    const llm = tweakedLlm((out, attempt) =>
      attempt === 1 ? { ...out, visualSystem: { ...out.visualSystem, colorUsage: "neon #00ff00 on every surface" } } : out,
    )
    const res = await runSiteBlueprint(input(llm))
    expect(res.ok).toBe(true)
    expect(res.attempts).toBe(2)
    expect(llm.calls[1]!.prompt).toMatch(/outside the palette: #00ff00/)
  })

  it("strips a mediaScript item that points at a missing section", async () => {
    const llm = tweakedLlm((out) => ({
      ...out,
      mediaScript: [...out.mediaScript, { ...out.mediaScript[0]!, itemId: "ghost", slotId: "home/pricing-7/background" }],
    }))
    const res = await runSiteBlueprint(input(llm))
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.attempts).toBe(2)
    expect(llm.calls[1]!.prompt).toMatch(/home\/pricing-7\/background" does not exist/)
    expect(res.blueprint.mediaScript.map((i) => i.itemId)).not.toContain("ghost")
    expect(res.blueprint.dropped.some((d) => d.reason.includes("does not exist"))).toBe(true)
  })

  it("fails after two bad answers without throwing", async () => {
    const llm = tweakedLlm(() => "not json at all")
    const res = await runSiteBlueprint(input(llm))
    expect(res.ok).toBe(false)
    expect(res.attempts).toBe(2)
    expect(llm.calls).toHaveLength(2)
  })

  it("treats a refusal as a failed attempt", async () => {
    const llm: Llm = { complete: async () => ({ text: "", refused: true }) }
    const res = await runSiteBlueprint(input(llm))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.join(" ")).toMatch(/declined/)
  })

  it("only allows the requested slots on a scoped re-run", async () => {
    const res = await runSiteBlueprint(input(new FakeLlm(), { mode: "media-only", slotIds: ["home/cta-3/background"] }))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.blueprint.mediaScript.every((i) => i.slotId === "home/cta-3/background")).toBe(true)
  })
})

describe("runSiteBlueprint (full mode)", () => {
  const structure = (ok: boolean) => ({
    prompt: "STRUCTURE instructions: design the pages",
    parse: (raw: unknown) =>
      ok
        ? { ok: true as const, value: { pages: pages(), siteType: "SINGLE_PAGE" as const, copyFramework: "AIDA" as const } }
        : { ok: false as const, errors: [`pages: invalid ${typeof raw}`] },
  })

  it("returns the structure from the structure agent's own parser", async () => {
    const res = await runSiteBlueprint(input(new FakeLlm(), { mode: "full", site: undefined, structure: structure(true) }))
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.structure?.copyFramework).toBe("AIDA")
      expect(res.blueprint.mode).toBe("full")
    }
  })

  it("fails when the structure never validates, so the caller can fall back", async () => {
    const res = await runSiteBlueprint(input(new FakeLlm(), { mode: "full", site: undefined, structure: structure(false) }))
    expect(res.ok).toBe(false)
  })
})

describe("isBlueprintFresh", () => {
  it("is stale when sections, the copy framework or the stale flag change", async () => {
    const res = await runSiteBlueprint(input(new FakeLlm()))
    if (!res.ok) throw new Error("expected a blueprint")
    const p = pages()
    expect(isBlueprintFresh(res.blueprint, p, "AIDA")).toBe(true)
    expect(isBlueprintFresh(res.blueprint, p, "PAS")).toBe(false)
    expect(isBlueprintFresh(res.blueprint, [{ ...p[0]!, sections: p[0]!.sections.slice(1) }], "AIDA")).toBe(false)
    expect(isBlueprintFresh({ ...res.blueprint, stale: true }, p, "AIDA")).toBe(false)
    expect(isBlueprintFresh(null, p, "AIDA")).toBe(false)
  })
})
