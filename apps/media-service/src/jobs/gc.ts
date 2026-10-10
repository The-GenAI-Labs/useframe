import { mediaPrefix, type Deps } from "@/deps.js"
import { log, metric } from "@/lib/logger.js"

const ABANDONED_UPLOAD_MS = 60 * 60 * 1000
const PURGE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
const BATCH = 200

type AssetWhere = NonNullable<Parameters<Deps["db"]["mediaAsset"]["findMany"]>[0]>["where"]

async function purge(deps: Deps, where: AssetWhere): Promise<number> {
  let purged = 0
  for (;;) {
    const batch = await deps.db.mediaAsset.findMany({ where, select: { id: true, projectId: true }, take: BATCH })
    for (const asset of batch) {
      await deps.store.deletePrefix(mediaPrefix(asset.projectId, asset.id))
      await deps.db.mediaAsset.delete({ where: { id: asset.id } })
      purged++
    }
    if (batch.length < BATCH) return purged
  }
}

// Deployed sites hold their own copies, so purging never breaks a live site.
export async function runMediaGc(deps: Deps, now = new Date()): Promise<{ abandoned: number; purged: number }> {
  const abandoned = await purge(deps, {
    status: "UPLOADING",
    createdAt: { lt: new Date(now.getTime() - ABANDONED_UPLOAD_MS) },
  })
  const purged = await purge(deps, { deletedAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) } })
  metric("media.gc_purged", purged, { abandoned })
  log.info("media gc finished", { abandoned, purged })
  return { abandoned, purged }
}
