import { generateObject } from "ai"
import type { LanguageModelV1 } from "ai"
import {
  DesignBriefSchema,
  DesignBriefCandidatesSchema,
  type DesignBrief,
  type DesignBriefCandidates,
} from "@repo/schemas"
import {
  DEFAULT_PLANNER_PROMPT,
  type PlannerPromptVars,
} from "@/prompts/planner.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

const CANDIDATES_SYSTEM_PROMPT = `You are a design decision engine. Produce TWO genuinely distinct design directions from the research findings provided — not two near-identical variants. Vary at least color, typography, and tone between them.

Each candidate must independently follow the same citation rules: for every decision, pick one option from that finding's options array, cite the findingId, never invent a citation.

Then recommend which candidate best fits the stated brand_personality and price_positioning, with a one-sentence reason.`

function fallbackBrief(v: PlannerPromptVars): DesignBrief {
  return {
    product: v.extracted.startupIdea.slice(0, 80),
    audience: { primary: v.extracted.audience },
    goal: "Convert visitors into signups or purchases",
    brand: {
      personality: v.extracted.brandPersonality ?? "confident",
      positioning: v.extracted.pricePositioning ?? "mid-range",
      tone: "clear and direct",
    },
    colors: {
      primary: "#2563EB",
      secondary: "#F1F5F9",
      accent: "#F97316",
      rationale: "Fallback: no retrieved findings were available, so a safe trust-blue default was used.",
      citation: "",
    },
    typography: {
      primary: "Inter",
      secondary: "DM Sans",
      minSize: "16px",
      rationale: "Fallback: widely legible sans-serif defaults.",
      citation: "",
    },
    layout: {
      sections: v.domainPattern?.typicalSections ?? ["HERO", "FEATURES", "HOW_IT_WORKS", "TESTIMONIALS", "CTA", "FOOTER"],
      rationale: "Fallback: used the domain's typical section pattern, or a generic pattern if unavailable.",
      citation: "",
    },
    copyFramework: "AIDA",
    frameworkRationale: "Fallback: AIDA is a broadly applicable default framework.",
    density: "medium",
    motion: "subtle",
    accessibility: { minContrast: "4.5:1", touchTarget: "44px" },
    avoid: [],
    citations: [],
  }
}

// Fallback pair for when the two-candidate call fails. Deliberately differs
// in colour, typography and tone — a fallback that returned the same brief
// twice would leave the picker with no actual choice to make.
function fallbackCandidates(v: PlannerPromptVars): DesignBriefCandidates {
  const base = fallbackBrief(v)

  return {
    candidateA: base,
    candidateB: {
      ...base,
      brand: { ...base.brand, tone: "warm and reassuring" },
      colors: {
        primary: "#0F766E",
        secondary: "#F0FDFA",
        accent: "#F59E0B",
        rationale: "Fallback alternative: a teal/amber pairing as a distinct second direction.",
        citation: "",
      },
      typography: {
        primary: "Source Serif 4",
        secondary: "Inter",
        minSize: "16px",
        rationale: "Fallback alternative: a serif headline voice to contrast option A's sans-serif.",
        citation: "",
      },
      copyFramework: "PAS",
      frameworkRationale: "Fallback alternative: PAS leads with the problem, contrasting A's AIDA.",
    },
    recommended: "A",
    recommendedReason:
      "No research findings were available, so the safer neutral direction is recommended.",
  }
}

// Two distinct directions from one set of findings, for the candidate picker.
// The single-brief runPlannerAgent below is kept for /plan/sync, which has no
// picker and just needs one brief.
export async function runPlannerCandidatesAgent(
  vars: PlannerPromptVars,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
): Promise<DesignBriefCandidates> {
  const prompt = DEFAULT_PLANNER_PROMPT(vars)

  try {
    const { object } = await generateObject({
      model,
      schema: DesignBriefCandidatesSchema,
      system: CANDIDATES_SYSTEM_PROMPT,
      prompt,
      providerOptions,
      experimental_telemetry: { isEnabled: true, functionId: "planner-candidates-agent" },
    })
    return object
  } catch (err) {
    console.error("[planner] candidate generateObject failed, using fallback pair:", err)
    return fallbackCandidates(vars)
  }
}

export async function runPlannerAgent(
  vars: PlannerPromptVars,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
): Promise<DesignBrief> {
  const prompt = DEFAULT_PLANNER_PROMPT(vars)

  try {
    const { object } = await generateObject({
      model,
      schema: DesignBriefSchema,
      prompt,
      providerOptions,
      experimental_telemetry: { isEnabled: true, functionId: "planner-agent" },
    })
    return object
  } catch (err) {
    console.error("[planner] generateObject failed, using fallback brief:", err)
    return fallbackBrief(vars)
  }
}
