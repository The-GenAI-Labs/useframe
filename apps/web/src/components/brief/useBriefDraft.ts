"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  isBlankValue,
  type BriefData,
  type BriefFieldErrors,
  type BriefMode,
  type BriefStepPointer,
  type BriefView,
  type FieldId,
  type PatchBriefInput,
} from "@repo/schemas"
import { briefsApi, type BriefApiError } from "@/lib/api/services/briefs.service"

const AUTOSAVE_DELAY_MS = 800

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict" | "rateLimited"

type Pending = {
  set: Partial<Record<FieldId, unknown>>
  unset: Set<FieldId>
  aiDecide: Partial<Record<FieldId, boolean>>
}

const emptyPending = (): Pending => ({ set: {}, unset: new Set(), aiDecide: {} })

function isEmpty(p: Pending): boolean {
  return Object.keys(p.set).length === 0 && p.unset.size === 0 && Object.keys(p.aiDecide).length === 0
}

function merge(into: Pending, from: Pending): void {
  for (const [k, v] of Object.entries(from.set)) if (!(k in into.set) && !into.unset.has(k as FieldId)) into.set[k as FieldId] = v
  for (const k of from.unset) if (!(k in into.set)) into.unset.add(k)
  for (const [k, v] of Object.entries(from.aiDecide)) if (!(k in into.aiDecide)) into.aiDecide[k as FieldId] = v
}

function overlay(data: BriefData, p: Pending): BriefData {
  const next: Record<string, unknown> = { ...data, ...p.set }
  for (const k of p.unset) delete next[k]
  for (const [k, on] of Object.entries(p.aiDecide)) if (on) delete next[k]
  return next as BriefData
}

function toBody(version: number, p: Pending, columns: { mode?: BriefMode; currentStep?: BriefStepPointer }): PatchBriefInput {
  return {
    expectedVersion: version,
    ...(Object.keys(p.set).length ? { set: p.set as Record<string, unknown> } : {}),
    ...(p.unset.size ? { unset: [...p.unset] } : {}),
    ...(Object.keys(p.aiDecide).length ? { aiDecide: p.aiDecide as Record<string, boolean> } : {}),
    ...columns,
  }
}

// Owns the working copy of a brief. In "draft" mode every change is
// autosaved (debounced, optimistic-concurrency); in "edit" mode changes are
// held until save() so an attached brief gets one revision per save.
export function useBriefDraft(kind: "draft" | "edit", projectSlug?: string) {
  const [brief, setBriefState] = useState<BriefView | null>(null)
  const [data, setData] = useState<BriefData>({})
  const [errors, setErrors] = useState<BriefFieldErrors>({})
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [dirty, setDirty] = useState(false)

  const briefRef = useRef<BriefView | null>(null)
  const pending = useRef<Pending>(emptyPending())
  const columns = useRef<{ mode?: BriefMode; currentStep?: BriefStepPointer }>({})
  const inflight = useRef<Promise<unknown> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flushRef = useRef<() => Promise<BriefView | null>>(async () => null)

  const setBrief = useCallback((view: BriefView | null) => {
    briefRef.current = view
    setBriefState(view)
  }, [])

  const load = useCallback(
    (view: BriefView) => {
      pending.current = emptyPending()
      columns.current = {}
      setBrief(view)
      setData(view.data)
      setErrors({})
      setDirty(false)
      setSaveState("idle")
    },
    [setBrief],
  )

  const acceptServer = useCallback(
    (view: BriefView) => {
      setBrief(view)
      setData(overlay(view.data, pending.current))
    },
    [setBrief],
  )

  const schedule = useCallback(
    (delay = AUTOSAVE_DELAY_MS) => {
      if (kind === "edit") {
        setDirty(true)
        return
      }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flushRef.current(), delay)
    },
    [kind],
  )

  const flush = useCallback(async (): Promise<BriefView | null> => {
    if (kind === "edit") return briefRef.current
    if (timer.current) clearTimeout(timer.current)
    while (inflight.current) await inflight.current.catch(() => {})
    const current = briefRef.current
    if (!current || (isEmpty(pending.current) && Object.keys(columns.current).length === 0)) return current

    const take = pending.current
    const cols = columns.current
    pending.current = emptyPending()
    columns.current = {}
    setSaveState("saving")

    const request = briefsApi
      .patch(current.id, toBody(current.version, take, cols))
      .then((view) => {
        acceptServer(view)
        setSaveState("saved")
      })
      .catch((err: BriefApiError) => {
        if (err.status === 409) {
          merge(pending.current, take)
          setSaveState("conflict")
          return
        }
        if (err.status === 422 && err.errors) {
          setErrors((prev) => ({ ...prev, ...err.errors }))
          const failed = new Set(Object.keys(err.errors).map((k) => k.split(".")[0]))
          const retry: Pending = emptyPending()
          for (const [k, v] of Object.entries(take.set)) if (!failed.has(k)) retry.set[k as FieldId] = v
          for (const k of take.unset) if (!failed.has(k)) retry.unset.add(k)
          for (const [k, v] of Object.entries(take.aiDecide)) if (!failed.has(k)) retry.aiDecide[k as FieldId] = v
          merge(pending.current, retry)
          columns.current = { ...cols, ...columns.current }
          setSaveState("error")
          if (!isEmpty(pending.current)) schedule()
          return
        }
        merge(pending.current, take)
        columns.current = { ...cols, ...columns.current }
        if (err.status === 429) {
          setSaveState("rateLimited")
          schedule(((err.retryAfter ?? 10) + 1) * 1000)
          return
        }
        setSaveState("error")
        schedule(5000)
      })
    inflight.current = request
    await request
    inflight.current = null
    if (!isEmpty(pending.current)) schedule()
    return briefRef.current
  }, [kind, acceptServer, schedule])
  flushRef.current = flush

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const clearErrorsFor = useCallback((id: FieldId) => {
    setErrors((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(next)) if (k === id || k.startsWith(`${id}.`)) delete next[k]
      return next
    })
  }, [])

  const setField = useCallback(
    (id: FieldId, value: unknown) => {
      const blank = isBlankValue(value) && typeof value !== "boolean"
      setData((prev) => {
        const next: Record<string, unknown> = { ...prev }
        if (blank) delete next[id]
        else next[id] = value
        return next as BriefData
      })
      if (blank) {
        delete pending.current.set[id]
        pending.current.unset.add(id)
      } else {
        pending.current.set[id] = value
        pending.current.unset.delete(id)
      }
      if (pending.current.aiDecide[id]) delete pending.current.aiDecide[id]
      clearErrorsFor(id)
      schedule()
    },
    [schedule, clearErrorsFor],
  )

  const setAiDecide = useCallback(
    (id: FieldId, on: boolean) => {
      pending.current.aiDecide[id] = on
      if (on) {
        delete pending.current.set[id]
        pending.current.unset.delete(id)
        setData((prev) => {
          const next: Record<string, unknown> = { ...prev }
          delete next[id]
          return next as BriefData
        })
      }
      setBriefState((b) =>
        b ? { ...b, meta: { ...b.meta, [id]: { ...(b.meta[id] ?? { source: "user", confirmed: true, updatedAt: "" }), aiDecide: on } } } : b,
      )
      clearErrorsFor(id)
      schedule()
    },
    [schedule, clearErrorsFor],
  )

  const setColumns = useCallback(
    (cols: { mode?: BriefMode; currentStep?: BriefStepPointer }) => {
      if (kind === "edit") return
      columns.current = { ...columns.current, ...cols }
      schedule()
    },
    [kind, schedule],
  )

  const isAiDecide = useCallback(
    (id: FieldId) => pending.current.aiDecide[id] ?? brief?.meta[id]?.aiDecide === true,
    [brief],
  )

  // Edit mode: one PATCH for everything changed since the modal opened.
  const saveEdit = useCallback(async (): Promise<{ brief: BriefView; regenerateNeeded: boolean }> => {
    const current = briefRef.current
    if (!current || !projectSlug) throw new Error("Nothing to save")
    const take = pending.current
    try {
      const result = await briefsApi.patchForProject(projectSlug, toBody(current.version, take, {}))
      pending.current = emptyPending()
      setBrief(result.brief)
      setData(result.brief.data)
      setDirty(false)
      return result
    } catch (err) {
      const e = err as BriefApiError
      if (e.status === 422 && e.errors) setErrors(e.errors)
      if (e.status === 409) setSaveState("conflict")
      throw err
    }
  }, [projectSlug, setBrief])

  const hasUserAnswers = useCallback(() => {
    const meta = briefRef.current?.meta ?? {}
    return !isEmpty(pending.current) || Object.values(meta).some((m) => m?.source === "user")
  }, [])

  return {
    brief,
    data,
    errors,
    setErrors,
    saveState,
    dirty,
    load,
    acceptServer,
    flush,
    setField,
    setAiDecide,
    setColumns,
    isAiDecide,
    saveEdit,
    hasUserAnswers,
  }
}

export type BriefDraft = ReturnType<typeof useBriefDraft>
