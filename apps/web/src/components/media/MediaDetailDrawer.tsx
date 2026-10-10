"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { mediaApi, type MediaUsage } from "@/lib/api/services/media.service"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatBytes, formatDuration, usageLabel } from "./mediaFormat"

const field =
  "w-full rounded-xl border border-base bg-transparent px-3 py-2 text-[13px] text-pri placeholder:text-mut focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500"
const primaryButton =
  "rounded-xl bg-inv px-4 py-2 text-[12.5px] font-semibold text-inv transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 cursor-pointer"
const secondaryButton =
  "rounded-xl border border-base px-3 py-2 text-[12.5px] font-medium text-sec transition-all hover:bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 cursor-pointer"
const dangerButton =
  "rounded-xl border border-red-300 px-3 py-2 text-[12.5px] font-medium text-red-600 transition-all hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 cursor-pointer dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"

type Props = {
  slug: string
  assetId: string | null
  onClose: () => void
  onChanged: () => void
}

export function MediaDetailDrawer({ slug, assetId, onClose, onChanged }: Props) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const { data: asset, isLoading } = useQuery({
    queryKey: ["media-item", slug, assetId],
    queryFn: () => mediaApi.get(slug, assetId!),
    enabled: !!assetId,
    refetchInterval: (q) => (q.state.data?.status === "PROCESSING" ? 3000 : false),
  })

  const [title, setTitle] = useState("")
  const [altText, setAltText] = useState("")
  const [caption, setCaption] = useState("")
  const [decorative, setDecorative] = useState(false)
  const [inUse, setInUse] = useState<MediaUsage[] | null>(null)

  useEffect(() => {
    if (!asset) return
    setTitle(asset.title ?? "")
    setAltText(asset.altText ?? "")
    setCaption(asset.caption ?? "")
    setDecorative(asset.decorative)
  }, [asset])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["media-item", slug, assetId] })
    onChanged()
  }

  const save = useMutation({
    mutationFn: () =>
      mediaApi.update(slug, assetId!, {
        title: title.trim() || undefined,
        altText: altText.trim() || null,
        caption: caption.trim() || null,
        decorative,
      }),
    onSuccess: () => {
      toast.success("Saved")
      refresh()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const remove = useMutation({
    mutationFn: (force: boolean) => mediaApi.remove(slug, assetId!, force),
    onSuccess: () => {
      toast.success("Deleted")
      setInUse(null)
      onChanged()
      onClose()
    },
    onError: (err: Error & { code?: string; data?: unknown }) => {
      if (err.code === "MEDIA_IN_USE") {
        setInUse((err.data as { usage?: MediaUsage[] } | undefined)?.usage ?? [])
        return
      }
      toast.error(err.message)
    },
  })

  const retry = useMutation({
    mutationFn: () => mediaApi.retry(slug, assetId!),
    onSuccess: refresh,
    onError: (err: Error) => toast.error(err.message),
  })

  const missingAlt = !decorative && !altText.trim()

  return (
    <>
      <Sheet open={!!assetId} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "max-h-[90vh] overflow-y-auto rounded-t-2xl" : "w-full overflow-y-auto sm:max-w-md"}
        >
          <SheetHeader className="pb-2">
            <SheetTitle className="pr-8 text-[15px]">{asset?.title ?? "Media"}</SheetTitle>
            <SheetDescription className="text-[12px]">
              {asset ? `${asset.kind === "VIDEO" ? "Video" : "Image"} · ${asset.origin === "GENERATED" ? "AI-generated" : "Uploaded"}` : " "}
            </SheetDescription>
          </SheetHeader>

          {isLoading || !asset ? (
            <div className="px-6 pb-6 text-[13px] text-mut" role="status">
              Loading…
            </div>
          ) : (
            <div className="flex flex-col gap-5 px-6 pb-8">
              <div className="overflow-hidden rounded-xl border border-base bg-tertiary">
                {asset.status !== "READY" ? (
                  <div className="flex aspect-video items-center justify-center p-4 text-center text-[13px] text-mut">
                    {asset.status === "FAILED" ? asset.failureReason ?? "This file couldn't be processed." : "Optimizing…"}
                  </div>
                ) : asset.kind === "VIDEO" && asset.preview.video ? (
                  <video
                    controls
                    playsInline
                    preload="metadata"
                    poster={asset.preview.poster ?? undefined}
                    src={asset.preview.video}
                    aria-label={asset.altText ?? asset.title ?? "Video preview"}
                    className="aspect-video w-full bg-black object-contain"
                  />
                ) : asset.preview.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
                  <img
                    src={asset.preview.image}
                    alt={asset.altText ?? ""}
                    className="max-h-80 w-full object-contain"
                    style={{ backgroundColor: asset.dominantColor ?? undefined }}
                  />
                ) : null}
              </div>

              {asset.aiGenerated && (
                <div className="rounded-xl border border-base p-3 text-[12px] text-sec">
                  <span className="mr-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    AI-generated
                  </span>
                  How this was made: created by useframe&apos;s image generator for this project.
                </div>
              )}

              {asset.status === "FAILED" && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 p-3 text-[12.5px] text-red-700 dark:border-red-900 dark:text-red-400">
                  <span>{asset.failureReason ?? "This file couldn't be processed."}</span>
                  {asset.retryable && (
                    <button type="button" className={secondaryButton} onClick={() => retry.mutate()} disabled={retry.isPending}>
                      {retry.isPending ? "Retrying…" : "Retry"}
                    </button>
                  )}
                </div>
              )}

              {asset.warnings.map((w) => (
                <p key={w} className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  {w}
                </p>
              ))}

              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  save.mutate()
                }}
              >
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="media-title" className="text-[12px] font-medium text-sec">
                    Title
                  </label>
                  <input id="media-title" className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="media-alt" className="flex items-center gap-1.5 text-[12px] font-medium text-sec">
                    Alt text
                    {missingAlt && (
                      <span className="text-amber-600" role="img" aria-label="Missing alt text" title="Add alt text so screen readers can describe this">
                        ⚠
                      </span>
                    )}
                  </label>
                  <textarea
                    id="media-alt"
                    className={field}
                    rows={2}
                    maxLength={200}
                    value={altText}
                    disabled={decorative}
                    aria-describedby="media-alt-hint"
                    onChange={(e) => setAltText(e.target.value)}
                  />
                  <p id="media-alt-hint" className="text-[11.5px] text-mut">
                    {missingAlt
                      ? "Describe what the image shows for people using screen readers."
                      : "A suggestion is filled in automatically; edit it freely."}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="media-caption" className="text-[12px] font-medium text-sec">
                    Caption
                  </label>
                  <textarea id="media-caption" className={field} rows={2} maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="media-decorative" className="text-[12.5px] text-sec">
                    Decorative only (hidden from screen readers)
                  </label>
                  <Switch id="media-decorative" checked={decorative} onCheckedChange={setDecorative} />
                </div>
                <button type="submit" className={primaryButton} disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save changes"}
                </button>
              </form>

              <section aria-labelledby="media-used-in">
                <h3 id="media-used-in" className="mb-1.5 text-[12px] font-semibold text-pri">
                  Used in
                </h3>
                {asset.usage.length === 0 ? (
                  <p className="text-[12.5px] text-mut">Not used on the current version yet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-[12.5px] text-sec">
                    {asset.usage.map((u) => (
                      <li key={u.slotId}>{usageLabel(u)}</li>
                    ))}
                  </ul>
                )}
              </section>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <dt className="text-mut">Size</dt>
                <dd className="text-pri">{formatBytes(asset.bytes)}</dd>
                {asset.width && asset.height ? (
                  <>
                    <dt className="text-mut">Dimensions</dt>
                    <dd className="text-pri">
                      {asset.width} × {asset.height}
                    </dd>
                  </>
                ) : null}
                {asset.durationMs ? (
                  <>
                    <dt className="text-mut">Duration</dt>
                    <dd className="text-pri">{formatDuration(asset.durationMs)}</dd>
                  </>
                ) : null}
                {asset.kind === "VIDEO" && asset.hasAudio !== null ? (
                  <>
                    <dt className="text-mut">Audio</dt>
                    <dd className="text-pri">{asset.hasAudio ? "Yes" : "No"}</dd>
                  </>
                ) : null}
              </dl>

              <button type="button" className={dangerButton} onClick={() => remove.mutate(false)} disabled={remove.isPending}>
                {remove.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={inUse !== null} onOpenChange={(open) => !open && setInUse(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This media is on your site</DialogTitle>
            <DialogDescription>
              Deleting it empties these spots the next time the site is generated or deployed. Sites that are already
              live keep their own copy.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1 text-[13px] text-sec">
            {inUse?.map((u) => <li key={u.slotId}>{usageLabel(u)}</li>)}
          </ul>
          <DialogFooter>
            <button type="button" className={secondaryButton} onClick={() => setInUse(null)}>
              Keep it
            </button>
            <button type="button" className={dangerButton} onClick={() => remove.mutate(true)} disabled={remove.isPending}>
              Delete anyway
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
