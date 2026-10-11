"use client"

import Link from "next/link"
import { useCallback, useId, useRef, useState } from "react"
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { mediaApi, type MediaFilters, type MediaItem } from "@/lib/api/services/media.service"
import { Progress } from "@/components/ui/progress"
import { MediaDetailDrawer } from "@/components/media/MediaDetailDrawer"
import { ACCEPTED_MEDIA, useMediaUploads, type UploadEntry } from "@/components/media/useMediaUploads"
import { formatBytes, formatDuration } from "@/components/media/mediaFormat"

type Props = { projectSlug: string }

const FILTERS: { id: string; label: string; value: MediaFilters }[] = [
  { id: "all", label: "All", value: {} },
  { id: "images", label: "Images", value: { kind: "IMAGE" } },
  { id: "videos", label: "Videos", value: { kind: "VIDEO" } },
  { id: "uploaded", label: "Uploaded", value: { origin: "UPLOADED" } },
  { id: "generated", label: "AI-generated", value: { origin: "GENERATED" } },
]

const PHASE_LABEL: Record<UploadEntry["phase"], string> = {
  uploading: "Uploading",
  verifying: "Checking file…",
  processing: "Optimizing…",
  done: "Ready",
  failed: "Failed",
  cancelled: "Cancelled",
}

const chip =
  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"

function UploadRow({ upload, onCancel, onDismiss }: { upload: UploadEntry; onCancel: () => void; onDismiss: () => void }) {
  const settled = upload.phase === "done" || upload.phase === "failed" || upload.phase === "cancelled"
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-base p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px] font-medium text-pri">{upload.name}</span>
        <span className={`shrink-0 text-[11.5px] ${upload.phase === "failed" ? "text-red-600 dark:text-red-400" : "text-mut"}`}>
          {upload.phase === "uploading" ? `${upload.progress}%` : PHASE_LABEL[upload.phase]}
        </span>
      </div>
      {upload.phase === "uploading" && <Progress value={upload.progress} className="h-1.5" aria-label={`Uploading ${upload.name}`} />}
      {upload.message && (
        <p className={`text-[12px] ${upload.phase === "failed" ? "text-red-600 dark:text-red-400" : "text-mut"}`}>
          {upload.message}
          {upload.code === "MEDIA_PAID_ONLY" && (
            <>
              {" "}
              <Link href="/billing" className="font-semibold underline underline-offset-2">
                See plans
              </Link>
            </>
          )}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {upload.phase === "uploading" && (
          <button type="button" onClick={onCancel} className="text-[12px] font-medium text-sec underline-offset-2 hover:underline">
            Cancel
          </button>
        )}
        {settled && (
          <button type="button" onClick={onDismiss} className="text-[12px] font-medium text-mut underline-offset-2 hover:underline">
            Dismiss
          </button>
        )}
      </div>
    </li>
  )
}

function MediaTile({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  const label = `${item.title ?? "Untitled"}, ${item.kind === "VIDEO" ? "video" : "image"}, ${
    item.origin === "GENERATED" ? "AI-generated" : "uploaded"
  }${item.status !== "READY" ? `, ${item.status === "FAILED" ? "failed" : "optimizing"}` : ""}${item.needsAlt ? ", needs alt text" : ""}`
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        className="group flex w-full flex-col overflow-hidden rounded-xl border border-base text-left transition-all hover:border-em focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 cursor-pointer"
      >
        <div
          className="relative flex aspect-[4/3] items-center justify-center bg-tertiary"
          style={{ backgroundColor: item.dominantColor ?? undefined }}
        >
          {item.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
            <img src={item.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="px-2 text-center text-[11.5px] text-mut">
              {item.status === "FAILED" ? "Couldn't process" : "Optimizing…"}
            </span>
          )}
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-semibold text-white">
            {item.kind === "VIDEO" ? `Video${item.durationMs ? ` · ${formatDuration(item.durationMs)}` : ""}` : "Image"}
          </span>
          {item.needsAlt && item.status === "READY" && (
            <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-black" aria-hidden="true">
              !
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <span className="min-w-0 truncate text-[12px] font-medium text-pri">{item.title ?? "Untitled"}</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
              item.origin === "GENERATED"
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "bg-tertiary text-sec"
            }`}
          >
            {item.origin === "GENERATED" ? "AI-generated" : "Uploaded"}
          </span>
        </div>
        {item.status === "FAILED" && (
          <p className="px-2.5 pb-2 text-[11.5px] text-red-600 dark:text-red-400">{item.failureReason ?? "Failed"}</p>
        )}
      </button>
    </li>
  )
}

export function MediaTab({ projectSlug }: Props) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const searchId = useId()
  const [filterId, setFilterId] = useState("all")
  const [search, setSearch] = useState("")
  const [dragging, setDragging] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const filters = { ...FILTERS.find((f) => f.id === filterId)!.value, q: search.trim() || undefined }

  const quota = useQuery({ queryKey: ["media-quota"], queryFn: () => mediaApi.quota() })
  const list = useInfiniteQuery({
    queryKey: ["media", projectSlug, filters],
    queryFn: ({ pageParam }) => mediaApi.list(projectSlug, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some((i) => i.status === "PROCESSING" || i.status === "UPLOADING"))
        ? 3000
        : false,
  })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["media", projectSlug] })
    queryClient.invalidateQueries({ queryKey: ["media-quota"] })
  }, [queryClient, projectSlug])

  const { uploads, add, cancel, dismiss } = useMediaUploads(projectSlug, refresh)
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const q = quota.data
  const usedPct = q ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0
  const lastSettled = uploads.find((u) => u.phase === "done" || u.phase === "failed")

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 border-b border-base px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5 sm:w-72">
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-semibold text-pri">Storage</span>
            <span className="text-mut">{q ? `${formatBytes(q.used)} of ${formatBytes(q.limit)}` : "…"}</span>
          </div>
          <Progress value={usedPct} className="h-1.5" aria-label={`Media storage ${usedPct}% used`} />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_MEDIA}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              if (e.target.files?.length) add(e.target.files)
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-xl bg-inv px-4 py-2 text-[12.5px] font-semibold text-inv transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 cursor-pointer"
          >
            Upload
          </button>
        </div>
      </div>

      {q?.tier === "free" && (
        <p className="mx-4 mt-3 rounded-xl bg-tertiary px-3 py-2.5 text-[12px] text-sec">
          Free plan: images only, up to {q.limits.imagesPerProject} per project and {formatBytes(q.limits.maxImageBytes)} each.
          Video uploads and more space are available on paid plans.{" "}
          <Link href="/billing" className="font-semibold underline underline-offset-2">
            See plans
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter media" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filterId === f.id}
              onClick={() => setFilterId(f.id)}
              className={`${chip} ${filterId === f.id ? "bg-inv text-inv" : "bg-tertiary text-sec hover:text-pri"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="sm:w-56">
          <label htmlFor={searchId} className="sr-only">
            Search media
          </label>
          <input
            id={searchId}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or alt text"
            className="w-full rounded-xl border border-base bg-transparent px-3 py-2 text-[12.5px] text-pri placeholder:text-mut focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500"
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {lastSettled ? `${lastSettled.name}: ${lastSettled.phase === "done" ? "ready" : `failed. ${lastSettled.message ?? ""}`}` : ""}
      </p>

      {uploads.length > 0 && (
        <ul className="mx-4 mt-3 flex flex-col gap-2" aria-label="Uploads">
          {uploads.map((u) => (
            <UploadRow key={u.id} upload={u} onCancel={() => cancel(u.id)} onDismiss={() => dismiss(u.id)} />
          ))}
        </ul>
      )}

      <div
        className={`relative m-4 flex-1 rounded-2xl border-2 border-dashed p-3 transition-colors ${
          dragging ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20" : "border-transparent"
        }`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files.length) add(e.dataTransfer.files)
        }}
      >
        {list.isLoading ? (
          <p className="py-12 text-center text-[13px] text-mut" role="status">
            Loading media…
          </p>
        ) : list.isError ? (
          <p className="py-12 text-center text-[13px] text-red-600" role="alert">
            {(list.error as Error).message}
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-[13.5px] font-medium text-pri">Drop photos or videos here</p>
            <p className="max-w-sm text-[12.5px] text-mut">
              Uploaded media is optimized and placed on your site the next time it&apos;s generated. JPEG, PNG, WebP or AVIF
              images{q?.tier === "paid" ? ", and MP4, MOV or WebM videos up to a minute long" : ""}.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4" aria-label="Media library">
            {items.map((item) => (
              <MediaTile key={item.id} item={item} onOpen={() => setOpenId(item.id)} />
            ))}
          </ul>
        )}
        {list.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
              className="rounded-xl border border-base px-4 py-2 text-[12.5px] font-medium text-sec hover:bg-tertiary disabled:opacity-50 cursor-pointer"
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <MediaDetailDrawer slug={projectSlug} assetId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />
    </div>
  )
}
