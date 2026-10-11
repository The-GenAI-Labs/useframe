import { z } from "zod";
import { parseMediaVariants, SiteSpecSchema, type ResolvedMediaAsset } from "@repo/schemas";
import {
  buildRobotsTxt,
  buildSitemapXml,
  buildSite,
  withScaffold,
  type GeneratedFile,
} from "@repo/site-builder";
import type { Db } from "@/site/sync.js";
import { DeployError } from "./errors.js";
import type { MediaCopyItem } from "./media.js";

const NextFilesSchema = z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1);

export type VersionSource = { snapshot: unknown; nextFiles: unknown };

// Media as loaded from the library: resolved assets for the builder plus the
// source key of every variant, so the copy step can find what the markup uses.
export type VersionMedia = {
  assets: ResolvedMediaAsset[];
  sources: Map<string, { key: string; title: string }>;
};

export type BuildableVersion = { files: GeneratedFile[]; media: MediaCopyItem[]; mediaWarnings: string[] };

const NO_MEDIA: VersionMedia = { assets: [], sources: new Map() };

// Replicate versions carry a raw Next.js tree; generated versions carry a SiteSpec.
export function filesFromVersion(
  version: VersionSource,
  siteUrl: string,
  media: VersionMedia = NO_MEDIA,
): BuildableVersion {
  if (version.nextFiles !== null && version.nextFiles !== undefined) {
    const parsed = NextFilesSchema.safeParse(version.nextFiles);
    if (!parsed.success) throw new DeployError("This version's files are not in a deployable format.");
    try {
      return { files: withScaffold(parsed.data), media: [], mediaWarnings: [] };
    } catch (err) {
      throw new DeployError(
        "This version's files are not in a deployable format.",
        err instanceof Error ? err.message : undefined,
      );
    }
  }

  const spec = SiteSpecSchema.safeParse(version.snapshot);
  if (!spec.success) throw new DeployError("This version's site data is not in a deployable format.");
  const built = buildSite(
    spec.data,
    { robotsTxt: buildRobotsTxt(siteUrl), sitemapXml: buildSitemapXml(spec.data.pages, siteUrl) },
    { media: { target: "export", assets: media.assets } },
  );
  const items = built.mediaFiles.map((file) => {
    const source = media.sources.get(`${file.assetId}/${file.role}`);
    if (!source) throw new DeployError("A media file on this site could not be found.", `${file.assetId}/${file.role}`);
    const variant = media.assets.find((a) => a.id === file.assetId)!.variants.find((v) => v.role === file.role)!;
    return {
      assetId: file.assetId,
      title: source.title,
      sourceKey: source.key,
      destRelPath: file.path,
      bytes: file.bytes,
      mime: variant.mime,
    };
  });
  return { files: built.files, media: items, mediaWarnings: built.mediaWarnings };
}

export function referencedAssetIds(snapshot: unknown): string[] {
  const media = (snapshot as { media?: unknown } | null)?.media;
  if (!media || typeof media !== "object") return [];
  const ids = Object.values(media as Record<string, { assetId?: unknown }>).flatMap((b) =>
    typeof b?.assetId === "string" ? [b.assetId] : [],
  );
  return [...new Set(ids)];
}

export async function loadVersionMedia(db: Db, projectId: string, assetIds: string[]): Promise<VersionMedia> {
  if (assetIds.length === 0) return NO_MEDIA;
  // Scoped to the project, so a binding can never pull another project's media.
  const rows = await db.mediaAsset.findMany({
    where: { id: { in: assetIds }, projectId },
    select: {
      id: true,
      kind: true,
      origin: true,
      status: true,
      deletedAt: true,
      title: true,
      width: true,
      height: true,
      durationMs: true,
      dominantColor: true,
      lqip: true,
      altText: true,
      decorative: true,
      variants: true,
    },
  });
  const sources = new Map<string, { key: string; title: string }>();
  const assets = rows.map((row): ResolvedMediaAsset => {
    const variants = parseMediaVariants(row.variants);
    for (const v of variants) sources.set(`${row.id}/${v.role}`, { key: v.key, title: row.title ?? "Untitled" });
    return {
      id: row.id,
      kind: row.kind,
      origin: row.origin,
      status: row.status,
      deleted: row.deletedAt !== null,
      title: row.title,
      width: row.width,
      height: row.height,
      durationMs: row.durationMs,
      dominantColor: row.dominantColor,
      lqip: row.lqip,
      altText: row.altText,
      decorative: row.decorative,
      variants: variants.map(({ role, mime, width, height, bytes, sha256 }) => ({ role, mime, width, height, bytes, sha256 })),
    };
  });
  return { assets, sources };
}

export async function getBuildableFiles(
  db: Db,
  versionId: string,
  siteUrl: string,
  projectId: string,
): Promise<BuildableVersion> {
  const version = await db.projectVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: { snapshot: true, nextFiles: true },
  });
  const media = await loadVersionMedia(db, projectId, referencedAssetIds(version.snapshot));
  return filesFromVersion(version, siteUrl, media);
}
