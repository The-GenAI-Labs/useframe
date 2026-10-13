"use client"

import { useId, useState } from "react"
import type { CheckpointAction, MediaJob, MediaJobItem } from "@/lib/api/services/mediaJobs.service"

type Props = {
  job: MediaJob
  pending: boolean
  onAction: (action: Omit<CheckpointAction, "checkpoint">) => void
}

const TITLES: Record<NonNullable<MediaJob["checkpoint"]>, { title: string; help: string }> = {
  PLAN_APPROVE: { title: "Approve the media plan", help: "Here's what we plan to make and why. Remove anything you don't want." },
  CONCEPT_PICK: { title: "Pick an idea for each video", help: "We wrote three ideas per video. Our pick is marked; choose another if you prefer." },
  IMAGES_APPROVE: { title: "Check the images", help: "These are the stills, and the first and last scenes of each video." },
  VIDEO_APPROVE: { title: "Choose your videos", help: "Pick the take you like best for each video." },
}

const button =
  "rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:opacity-50 cursor-pointer"
const primary = `${button} bg-inv text-inv hover:opacity-90`
const secondary = `${button} border border-base text-sec hover:bg-tertiary`

function expiresIn(iso: string | null): string {
  if (!iso) return ""
  const hours = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000))
  return hours >= 1 ? `${hours} hour${hours === 1 ? "" : "s"}` : "less than an hour"
}

const active = (i: MediaJobItem) => i.decision === "GENERATE" && !["DROPPED", "SKIPPED", "FAILED"].includes(i.status)

function Thumb({ src, label }: { src: string | null; label: string }) {
  if (!src) return null
  return (
    <figure className="flex flex-col gap-1">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      <img src={src} alt={label} className="aspect-video w-full rounded-lg bg-tertiary object-cover" loading="lazy" />
      <figcaption className="text-[11px] text-mut">{label}</figcaption>
    </figure>
  )
}

function ConceptPicker({ item, pending, onAction }: { item: MediaJobItem; pending: boolean; onAction: Props["onAction"] }) {
  const name = useId()
  const noteId = useId()
  const [note, setNote] = useState("")
  const chosen = item.chosenId ?? item.recommendedId
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-[12.5px] font-semibold text-pri">{item.role}</legend>
      {item.concepts.map((c) => (
        <label
          key={c.id}
          className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-[12px] focus-within:outline-2 focus-within:outline-indigo-500 ${
            chosen === c.id ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30" : "border-base"
          }`}
        >
          <input
            type="radio"
            name={name}
            className="mt-0.5"
            checked={chosen === c.id}
            disabled={pending}
            onChange={() => onAction({ action: "pick", itemId: item.itemId, conceptId: c.id, note: note.trim() || undefined })}
          />
          <span className="flex flex-col gap-1">
            <span className="font-semibold text-pri">
              {c.title}
              {item.recommendedId === c.id && (
                <span className="ml-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10.5px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Our pick
                </span>
              )}
            </span>
            <span className="text-mut">{c.mechanism}</span>
            <span className="text-sec">{c.logline}</span>
            <span className="text-mut">{c.whyItFits}</span>
          </span>
        </label>
      ))}
      <label htmlFor={noteId} className="text-[11.5px] text-mut">
        Notes for this video (optional)
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={300}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
        className="rounded-xl border border-base bg-transparent px-3 py-2 text-[12px] text-pri focus-visible:outline-2 focus-visible:outline-indigo-500"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          disabled={pending || item.conceptRegenerationsLeft === 0}
          onClick={() => onAction({ action: "regenerate", itemId: item.itemId, note: note.trim() || undefined })}
        >
          New ideas ({item.conceptRegenerationsLeft} left)
        </button>
        {chosen && note.trim() && (
          <button type="button" className={secondary} disabled={pending} onClick={() => onAction({ action: "pick", itemId: item.itemId, conceptId: chosen, note: note.trim() })}>
            Save note
          </button>
        )}
      </div>
    </fieldset>
  )
}

export function MediaCheckpointCard({ job, pending, onAction }: Props) {
  const takesId = useId()
  const [takes, setTakes] = useState(1)
  if (!job.checkpoint) return null
  const copy = TITLES[job.checkpoint]
  const items = job.items.filter(active)

  return (
    <section aria-labelledby={`${takesId}-title`} className="flex flex-col gap-3 rounded-2xl border border-indigo-200 p-4 dark:border-indigo-900">
      <div>
        <h3 id={`${takesId}-title`} className="text-[13.5px] font-semibold text-pri">
          {copy.title}
        </h3>
        <p className="mt-0.5 text-[12px] text-sec">{copy.help}</p>
        <p className="mt-1 text-[11.5px] text-mut">
          Waiting for you for {expiresIn(job.checkpointExpiresAt)}. If you don&apos;t answer, your site keeps its current media and
          unused credits are refunded.
        </p>
      </div>

      {job.checkpoint === "PLAN_APPROVE" && (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.itemId} className="flex flex-col gap-1 rounded-xl border border-base p-3 text-[12px] sm:flex-row sm:items-start sm:justify-between">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold text-pri">
                  {i.kind === "video" ? `Video${i.durationSec ? ` · ${i.durationSec}s` : ""}` : "Image"} · {i.role}
                </span>
                <span className="text-sec">{i.reason}</span>
                <span className="text-mut">{i.credits} credits</span>
              </span>
              <button type="button" className={secondary} disabled={pending} onClick={() => onAction({ action: "drop", itemId: i.itemId })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {job.checkpoint === "CONCEPT_PICK" &&
        items
          .filter((i) => i.kind === "video" && i.concepts.length > 0)
          .map((i) => <ConceptPicker key={i.itemId} item={i} pending={pending} onAction={onAction} />)}

      {job.checkpoint === "IMAGES_APPROVE" && (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((i) => (
              <li key={i.itemId} className="flex flex-col gap-2 rounded-xl border border-base p-3">
                <span className="text-[12.5px] font-semibold text-pri">{i.role}</span>
                <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                  {i.kind === "image" ? (
                    <Thumb src={i.image} label="Image" />
                  ) : (
                    <>
                      <Thumb src={i.frames?.opening ?? null} label="First scene" />
                      <Thumb src={i.frames?.ending ?? null} label="Last scene" />
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={secondary} disabled={pending} onClick={() => onAction({ action: "regenerate", itemId: i.itemId })}>
                    Try again
                  </button>
                  {i.kind === "video" && i.frames?.opening && (
                    <button type="button" className={secondary} disabled={pending} onClick={() => onAction({ action: "skip", itemId: i.itemId })}>
                      Use the still instead
                    </button>
                  )}
                  <button type="button" className={secondary} disabled={pending} onClick={() => onAction({ action: "drop", itemId: i.itemId })}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-[11.5px] text-mut">Trying an image again uses extra credits.</p>
          {items.some((i) => i.kind === "video") && (
            <div className="flex items-center gap-2 text-[12px]">
              <label htmlFor={takesId} className="text-sec">
                Video takes to choose from
              </label>
              <select
                id={takesId}
                value={takes}
                onChange={(e) => setTakes(Number(e.target.value))}
                className="rounded-lg border border-base bg-transparent px-2 py-1 text-pri"
              >
                {[1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              {takes > 1 && <span className="text-mut">Each extra take uses more credits.</span>}
            </div>
          )}
        </>
      )}

      {job.checkpoint === "VIDEO_APPROVE" &&
        items
          .filter((i) => i.kind === "video" && i.candidates.length > 0)
          .map((i) => (
            <fieldset key={i.itemId} className="flex flex-col gap-2">
              <legend className="mb-1 text-[12.5px] font-semibold text-pri">{i.role}</legend>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {i.candidates.map((c, n) => {
                  const chosen = (i.chosenCandidateId ?? i.candidates[0]?.id) === c.id
                  return (
                    <div key={c.id} className={`flex flex-col gap-1.5 rounded-xl border p-2 ${chosen ? "border-indigo-400" : "border-base"}`}>
                      {c.video && (
                        <video src={c.video} poster={c.poster ?? undefined} controls muted playsInline preload="metadata" className="aspect-video w-full rounded-lg bg-black" aria-label={`Take ${n + 1}`} />
                      )}
                      <button
                        type="button"
                        aria-pressed={chosen}
                        className={chosen ? primary : secondary}
                        disabled={pending}
                        onClick={() => onAction({ action: "pick", itemId: i.itemId, candidateId: c.id })}
                      >
                        {chosen ? `Take ${n + 1} selected` : `Use take ${n + 1}`}
                      </button>
                    </div>
                  )
                })}
              </div>
              <button type="button" className={`${secondary} self-start`} disabled={pending} onClick={() => onAction({ action: "regenerate", itemId: i.itemId })}>
                Make another take (uses credits)
              </button>
            </fieldset>
          ))}

      <div className="flex justify-end">
        <button
          type="button"
          className={primary}
          disabled={pending}
          onClick={() => onAction({ action: "approve", ...(job.checkpoint === "IMAGES_APPROVE" && takes > 1 ? { candidates: takes } : {}) })}
        >
          {job.checkpoint === "PLAN_APPROVE" ? "Approve plan" : job.checkpoint === "VIDEO_APPROVE" ? "Use these videos" : "Continue"}
        </button>
      </div>
    </section>
  )
}
