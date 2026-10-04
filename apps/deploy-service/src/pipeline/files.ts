import { z } from "zod";
import { SiteSpecSchema } from "@repo/schemas";
import {
  buildRobotsTxt,
  buildSitemapXml,
  buildSiteFiles,
  withScaffold,
  type GeneratedFile,
} from "@repo/site-builder";
import type { Db } from "@/site/sync.js";
import { DeployError } from "./errors.js";

const NextFilesSchema = z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1);

export type VersionSource = { snapshot: unknown; nextFiles: unknown };

// Replicate versions carry a raw Next.js tree; generated versions carry a SiteSpec.
export function filesFromVersion(version: VersionSource, siteUrl: string): GeneratedFile[] {
  if (version.nextFiles !== null && version.nextFiles !== undefined) {
    const parsed = NextFilesSchema.safeParse(version.nextFiles);
    if (!parsed.success) throw new DeployError("This version's files are not in a deployable format.");
    try {
      return withScaffold(parsed.data);
    } catch (err) {
      throw new DeployError(
        "This version's files are not in a deployable format.",
        err instanceof Error ? err.message : undefined,
      );
    }
  }

  const spec = SiteSpecSchema.safeParse(version.snapshot);
  if (!spec.success) throw new DeployError("This version's site data is not in a deployable format.");
  return buildSiteFiles(spec.data, {
    robotsTxt: buildRobotsTxt(siteUrl),
    sitemapXml: buildSitemapXml(spec.data.pages, siteUrl),
  });
}

export async function getBuildableFiles(
  db: Db,
  versionId: string,
  siteUrl: string,
): Promise<GeneratedFile[]> {
  const version = await db.projectVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { snapshot: true, nextFiles: true },
  });
  return filesFromVersion(version, siteUrl);
}
