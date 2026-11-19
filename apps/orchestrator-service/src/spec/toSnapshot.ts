import type { SiteSpec } from "@repo/schemas"

export function toSnapshot(spec: SiteSpec): SiteSpec {
  return {
    projectId: spec.projectId,
    versionId: spec.versionId,
    siteType: spec.siteType,
    copyFramework: spec.copyFramework,
    designSystem: spec.designSystem ?? {
      primaryColor: "#0F766E",
      secondaryColor: "#E6F2F1",
      accentColor: "#D97706",
      fontPrimary: "Manrope",
      fontSecondary: "Inter",
      spacing: "comfortable",
      borderRadius: "md",
      animationStyle: "subtle",
    },
    pages: spec.pages ?? [],
    citations: spec.citations ?? [],
    ...(spec.theme ? { theme: spec.theme } : {}),
    // The renderer reads the brief's minimum text size and touch target.
    ...(spec.designBrief ? { designBrief: spec.designBrief } : {}),
    ...(spec.media && Object.keys(spec.media).length > 0 ? { media: spec.media } : {}),
  }
}
