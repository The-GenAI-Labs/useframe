import type { Prisma } from "@useframe/db"
import type { MediaAiConfig } from "./config.js"
import { refundAmount, refundItem, reserveExtra, type JobDb } from "./jobs.js"
import { readJobState, type ItemState, type JobState } from "./jobState.js"
import type { CheckpointAction } from "./schemas.js"

export class CheckpointError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 402 | 404 | 409,
    public readonly code: string,
  ) {
    super(message)
    this.name = "CheckpointError"
  }
}

export type CheckpointJob = {
  id: string
  userId: string
  status: string
  checkpoint: string | null
  state: unknown
}

const MAX_CONCEPT_REGENERATIONS = 2

function needItem(state: JobState, itemId: string | undefined): ItemState {
  const item = itemId ? state.items[itemId] : undefined
  if (!item) throw new CheckpointError("Unknown item", 404, "MEDIA_ITEM_NOT_FOUND")
  return item
}

const generated = (item: ItemState) => item.item.decision === "GENERATE" && !["DROPPED", "SKIPPED", "FAILED"].includes(item.status)

function videoSeconds(item: ItemState): number {
  return item.video?.durationSec ?? item.item.video?.durationSec ?? 5
}

// Applies one user action to the open checkpoint. Returns true when the job
// should resume (approve, or a regeneration that must re-run a stage).
export async function applyCheckpointAction(
  db: JobDb,
  job: CheckpointJob,
  action: CheckpointAction,
  config: MediaAiConfig,
): Promise<{ resume: boolean; state: JobState }> {
  if (job.status !== "AWAITING_USER" || job.checkpoint !== action.checkpoint) {
    throw new CheckpointError("This step is no longer waiting for you", 409, "MEDIA_CHECKPOINT_STALE")
  }
  const state = readJobState(job.state)
  let resume = false

  const charge = async (key: string, amount: number) => {
    try {
      await reserveExtra(db, job, state, key, amount)
    } catch (err) {
      if (err instanceof Error && err.name === "InsufficientCreditsError") {
        throw new CheckpointError(`You need ${amount} more credits for this`, 402, "INSUFFICIENT_CREDITS")
      }
      throw err
    }
  }

  switch (`${action.checkpoint}:${action.action}`) {
    case "PLAN_APPROVE:drop":
    case "IMAGES_APPROVE:drop": {
      const item = needItem(state, action.itemId)
      if (!generated(item)) throw new CheckpointError("This item can't be dropped", 400, "MEDIA_BAD_ACTION")
      item.status = "DROPPED"
      await refundItem(db, job, state, item.item.itemId, "AI media item dropped")
      break
    }
    case "CONCEPT_PICK:pick": {
      const item = needItem(state, action.itemId)
      const concept = item.concept
      if (!concept || !concept.concepts.some((c) => c.id === action.conceptId)) {
        throw new CheckpointError("Pick one of the three ideas", 400, "MEDIA_BAD_ACTION")
      }
      concept.chosenId = action.conceptId!
      if (action.note) concept.directorNotes = [...concept.directorNotes.slice(0, 4), action.note.slice(0, 300)]
      break
    }
    case "CONCEPT_PICK:regenerate": {
      const item = needItem(state, action.itemId)
      const count = item.concept?.regenerations ?? 0
      if (count >= MAX_CONCEPT_REGENERATIONS) throw new CheckpointError("You've asked for new ideas twice already", 409, "MEDIA_REGEN_LIMIT")
      item.done = item.done.filter((s) => s !== "CONCEPTS" && s !== "SELECT")
      item.note = action.note?.slice(0, 300)
      item.concept = item.concept ? { ...item.concept, regenerations: count + 1, concepts: [] } : undefined
      resume = true
      break
    }
    case "IMAGES_APPROVE:regenerate": {
      const item = needItem(state, action.itemId)
      if (!generated(item)) throw new CheckpointError("This item can't be regenerated", 400, "MEDIA_BAD_ACTION")
      const n = Object.keys(state.charges).filter((k) => k.startsWith(`${item.item.itemId}:regen:`)).length + 1
      await charge(`${item.item.itemId}:regen:${n}`, config.credits.image)
      item.done = item.done.filter((s) => s !== "FRAMES" && s !== "IMG_QA")
      item.note = action.note?.slice(0, 200)
      item.frames = undefined
      item.image = undefined
      resume = true
      break
    }
    case "IMAGES_APPROVE:skip": {
      const item = needItem(state, action.itemId)
      if (item.item.kind !== "video" || !item.frames?.openingAssetId) {
        throw new CheckpointError("Only a video with a scene can be skipped", 400, "MEDIA_BAD_ACTION")
      }
      item.status = "SKIPPED"
      item.fallbackAssetId = item.frames.openingAssetId
      const keep = 2 * config.credits.image
      await refundAmount(db, job, state, `${item.item.itemId}:skip`, (state.charges[item.item.itemId] ?? 0) - keep, "AI video skipped")
      state.settled[item.item.itemId] = "kept"
      break
    }
    case "VIDEO_APPROVE:pick": {
      const item = needItem(state, action.itemId)
      if (!item.video?.candidateAssetIds.includes(action.candidateId ?? "")) {
        throw new CheckpointError("Pick one of the candidates", 400, "MEDIA_BAD_ACTION")
      }
      item.video.chosenAssetId = action.candidateId
      break
    }
    case "VIDEO_APPROVE:regenerate": {
      const item = needItem(state, action.itemId)
      if (item.item.kind !== "video" || item.status === "DROPPED") throw new CheckpointError("Only videos can be regenerated here", 400, "MEDIA_BAD_ACTION")
      const n = Object.keys(state.charges).filter((k) => k.startsWith(`${item.item.itemId}:revideo:`)).length + 1
      await charge(`${item.item.itemId}:revideo:${n}`, videoSeconds(item) * config.credits.videoPerSecond)
      item.done = item.done.filter((s) => s !== "VIDEO" && s !== "VID_QA")
      item.status = "RUNNING"
      if (item.video) item.video = { ...item.video, candidateAssetIds: [], chosenAssetId: undefined, attempts: 0 }
      resume = true
      break
    }
    case "IMAGES_APPROVE:approve": {
      if (action.candidates && action.candidates > 1) {
        const videos = Object.values(state.items).filter(
          (i) => i.item.kind === "video" && generated(i) && (!action.itemId || i.item.itemId === action.itemId),
        )
        for (const item of videos) {
          const extra = action.candidates - (item.candidates ?? 1)
          if (extra > 0) await charge(`${item.item.itemId}:candidates:${action.candidates}`, extra * videoSeconds(item) * config.credits.videoPerSecond)
          item.candidates = action.candidates
        }
        if (action.itemId) break
      }
      state.approved = [...new Set([...state.approved, action.checkpoint])]
      resume = true
      break
    }
    case "PLAN_APPROVE:approve":
    case "CONCEPT_PICK:approve":
    case "VIDEO_APPROVE:approve":
      state.approved = [...new Set([...state.approved, action.checkpoint])]
      resume = true
      break
    default:
      throw new CheckpointError("That action isn't available at this step", 400, "MEDIA_BAD_ACTION")
  }

  await db.mediaJob.update({
    where: { id: job.id },
    data: {
      state: state as unknown as Prisma.InputJsonValue,
      ...(resume ? { status: "QUEUED", checkpoint: null, checkpointExpiresAt: null } : {}),
    },
  })
  return { resume, state }
}
