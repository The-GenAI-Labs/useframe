import type { SiteSpec, DesignBrief } from "@repo/schemas"

export type BriefComplianceResult = { compliant: boolean; violations: string[] }

/**
 * Standalone brief-compliance check. Evals can't import from
 * apps/orchestrator-service (not a workspace dependency), so this small
 * check lives here rather than behind a cross-app import.
 */
export function checkBriefCompliance(spec: Partial<SiteSpec>, brief: DesignBrief): BriefComplianceResult {
  const violations: string[] = []
  const ds = spec.designSystem

  if (ds && ds.primaryColor !== brief.colors.primary) {
    violations.push(`primaryColor drift: spec has "${ds.primaryColor}", brief specified "${brief.colors.primary}"`)
  }
  if (ds && ds.fontPrimary !== brief.typography.primary) {
    violations.push(`fontPrimary drift: spec has "${ds.fontPrimary}", brief specified "${brief.typography.primary}"`)
  }

  const specSections = spec.pages?.[0]?.sections.map((s) => s.type) ?? []
  const briefSections = brief.layout.sections
  if (JSON.stringify(specSections) !== JSON.stringify(briefSections)) {
    violations.push(`layout.sections drift: spec has [${specSections.join(", ")}], brief specified [${briefSections.join(", ")}]`)
  }

  return { compliant: violations.length === 0, violations }
}
