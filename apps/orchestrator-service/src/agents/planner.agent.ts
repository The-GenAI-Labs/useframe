import { generateObject } from "ai"
import type { LanguageModelV1 } from "ai"
import { DesignBriefSchema, type DesignBrief } from "@repo/schemas"
import {
  DEFAULT_PLANNER_PROMPT,
  type PlannerPromptVars,
} from "@/prompts/planner.prompt.js"

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

export async function runPlannerAgent(
  vars: PlannerPromptVars,
  model: LanguageModelV1,
): Promise<DesignBrief> {
  const prompt = DEFAULT_PLANNER_PROMPT(vars)

  try {
    const { object } = await generateObject({
      model,
      schema: DesignBriefSchema,
      prompt,
      experimental_telemetry: { isEnabled: true, functionId: "planner-agent" },
    })
    return object
  } catch (err) {
    console.error("[planner] generateObject failed, using fallback brief:", err)
    return fallbackBrief(vars)
  }
}
