import { buildSiteFiles, withScaffold } from "@repo/site-builder";
import type { SiteSpec } from "@repo/schemas";

const page = (slug: string, type: "HOME" | "ABOUT") => ({ type, slug, title: slug, sections: [] });

export const FIXTURE_SPEC = (pages: number): SiteSpec => ({
  siteType: pages > 1 ? "MULTI_PAGE" : "SINGLE_PAGE",
  pages: [page("home", "HOME"), ...(pages > 1 ? [page("about", "ABOUT")] : [])],
  designSystem: {
    primaryColor: "#111111",
    secondaryColor: "#222222",
    accentColor: "#333333",
    fontPrimary: "Inter",
    fontSecondary: "Inter",
    spacing: "md",
    borderRadius: "md",
    animationStyle: "none",
  },
  copyFramework: "AIDA",
  citations: [],
});

// The compiler pins its dependency sets, so the image bakes one node_modules per
// set; a project uses a template only when its dependency-map hash matches.
export function templatePackageJsons(): { name: string; packageJson: string }[] {
  const pkg = (files: { path: string; content: string }[]) =>
    files.find((f) => f.path === "package.json")!.content;
  return [
    { name: "vite-single", packageJson: pkg(buildSiteFiles(FIXTURE_SPEC(1))) },
    { name: "vite-multi", packageJson: pkg(buildSiteFiles(FIXTURE_SPEC(2))) },
    {
      name: "next-export",
      packageJson: pkg(withScaffold([{ path: "app/page.tsx", content: "export default () => null" }])),
    },
  ];
}
