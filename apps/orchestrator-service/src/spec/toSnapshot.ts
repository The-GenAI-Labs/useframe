import type { SiteSpec } from "@repo/schemas"

export function toSnapshot(spec: SiteSpec): SiteSpec {
  return {
    projectId: spec.projectId,
    versionId: spec.versionId,
    siteType: spec.siteType,
    copyFramework: spec.copyFramework,
    designSystem: spec.designSystem ?? {
      primaryColor: "#6366f1",
      secondaryColor: "#1e1b4b",
      accentColor: "#a5b4fc",
      fontPrimary: "Inter",
      fontSecondary: "DM Sans",
      spacing: "comfortable",
      borderRadius: "md",
      animationStyle: "subtle",
    },
    pages: spec.pages ?? [],
    citations: spec.citations ?? [],
  }
}
