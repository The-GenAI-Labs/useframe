export type PlannerFinding = {
  id: string
  claim: string
  paper: string
  decision: string
  options: { value: string; label: string; fits: string[] }[]
}

export type PlannerRetrievalResult = {
  decision: string
  findings: PlannerFinding[]
}

export type PlannerDomainPattern = {
  domain: string
  typicalSections: string[]
  toneRange: string[]
  conversionPattern: string
  commonObjections: string[]
  proofTypes: string[]
}

export type PlannerAudienceModifier = {
  audience: string
  modifies: Record<string, unknown>
}

export type PlannerExtracted = {
  startupIdea: string
  domain: string
  audience: string
  brandPersonality?: string
  pricePositioning?: string
  businessModel?: string
  differentiator?: string
}

export type PlannerPromptVars = {
  extracted: PlannerExtracted
  results: PlannerRetrievalResult[]
  domainPattern: PlannerDomainPattern | null
  audienceModifier: PlannerAudienceModifier | null
}

function formatFindings(results: PlannerRetrievalResult[]): string {
  return results
    .map(({ decision, findings }) => {
      if (findings.length === 0) {
        return `## Decision: ${decision}\n(No findings retrieved — use your best judgment and note this in the rationale, without inventing a citation.)`
      }
      const findingsText = findings
        .map(
          (f) =>
            `- findingId: "${f.id}"\n  claim: ${f.claim}\n  source: ${f.paper}\n  options: ${JSON.stringify(f.options)}`,
        )
        .join("\n")
      return `## Decision: ${decision}\n${findingsText}`
    })
    .join("\n\n")
}

export const DEFAULT_PLANNER_PROMPT = (v: PlannerPromptVars): string => `
You are a design decision engine. You do not write copy or code — you make grounded design
decisions for a landing page and produce a DesignBrief that other systems will execute exactly.

Startup idea: "${v.extracted.startupIdea}"
Domain: ${v.extracted.domain}
Audience: ${v.extracted.audience}
${v.extracted.brandPersonality ? `Brand personality: ${v.extracted.brandPersonality}\n` : ""}${v.extracted.pricePositioning ? `Price positioning: ${v.extracted.pricePositioning}\n` : ""}${v.extracted.businessModel ? `Business model: ${v.extracted.businessModel}\n` : ""}${v.extracted.differentiator ? `Differentiator: ${v.extracted.differentiator}\n` : ""}

${
  v.domainPattern
    ? `Domain pattern for "${v.domainPattern.domain}":
- Typical sections: ${v.domainPattern.typicalSections.join(", ")}
- Tone range: ${v.domainPattern.toneRange.join(", ")}
- Conversion pattern: ${v.domainPattern.conversionPattern}
- Common objections: ${v.domainPattern.commonObjections.join(", ")}
- Proof types: ${v.domainPattern.proofTypes.join(", ")}
`
    : "(No domain pattern available for this domain — use general best practice.)"
}

${
  v.audienceModifier
    ? `Audience modifier for "${v.audienceModifier.audience}":
${JSON.stringify(v.audienceModifier.modifies, null, 2)}
`
    : "(No audience modifier available for this audience — use general best practice.)"
}

Retrieved research findings, grouped by the decision they inform:

${formatFindings(v.results)}

RULES:
1. For every decision that has retrieved findings, pick exactly ONE option from that finding's
   options array — do not invent a value that isn't one of the listed options.
2. Choose the option whose "fits" tags best match the brand personality and price positioning.
3. Cite the exact findingId for every decision in your output's citations array. Never invent a
   citation or reference a findingId that wasn't given to you above.
4. If two findings conflict, state which you prioritized and why in that field's rationale.
5. If a decision had no findings retrieved, make a reasonable judgment call and say so plainly in
   the rationale — do not fabricate a citation for it.
6. The layout.sections array should reflect the domain pattern's typical sections, adjusted for
   the specific product where the retrieved layout findings suggest a deviation.
7. Respect the audience modifier's constraints (density, motion, contrast, avoid list) in your
   final decisions.
`.trim()
