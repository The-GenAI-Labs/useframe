"use client"

import { useEffect, useRef, useState } from "react"
import { BRIEF_UI_COPY, type BriefView, type PrefillBriefInput } from "@repo/schemas"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { briefsApi, type BriefApiError } from "@/lib/api/services/briefs.service"

type Props = {
  briefId: string | null
  defaultOpen: boolean
  autoRunText?: string
  beforeRun: () => Promise<unknown>
  onResult: (view: BriefView, filled: number) => void
  announce: (message: string) => void
}

type Tab = "text" | "url" | "doc"

export function PrefillPanel({ briefId, defaultOpen, autoRunText, beforeRun, onResult, announce }: Props) {
  const [open, setOpen] = useState(defaultOpen || !!autoRunText)
  const [tab, setTab] = useState<Tab>("text")
  const [text, setText] = useState(autoRunText ?? "")
  const [url, setUrl] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const autoRan = useRef(false)

  const run = async (input: { kind: Tab; text?: string; url?: string; file?: File | null }) => {
    if (!briefId) return
    setError(null)
    setRunning(true)
    announce(BRIEF_UI_COPY.prefillWorking)
    const ctrl = new AbortController()
    controller.current = ctrl
    try {
      await beforeRun()
      let payload: PrefillBriefInput
      if (input.kind === "doc") {
        if (!input.file) throw new Error("no file")
        const uploaded = await briefsApi.upload(briefId, input.file, "sourceDocument")
        const uploadId = uploaded.data.sourceDocument?.uploadId
        if (!uploadId) throw new Error("upload failed")
        payload = { kind: "doc", uploadId }
      } else if (input.kind === "url") {
        payload = { kind: "url", url: input.url ?? "" }
      } else {
        payload = { kind: "text", text: input.text ?? "" }
      }
      const result = await briefsApi.prefill(briefId, payload, ctrl.signal)
      onResult(result.brief, result.filled.length)
      const message = result.filled.length
        ? `We filled ${result.filled.length} answer${result.filled.length === 1 ? "" : "s"}. Check the ones marked ${BRIEF_UI_COPY.suggested}.`
        : "We didn't find anything new to fill in."
      announce(message)
      setError(null)
    } catch (err) {
      if (ctrl.signal.aborted) {
        announce("Cancelled")
        return
      }
      const e = err as BriefApiError
      const message = e.status === 429 ? BRIEF_UI_COPY.rateLimited : e.status === 413 || e.status === 415 ? e.message : BRIEF_UI_COPY.prefillFailed
      setError(message)
      announce(message)
    } finally {
      setRunning(false)
      controller.current = null
    }
  }

  useEffect(() => {
    if (autoRunText && briefId && !autoRan.current) {
      autoRan.current = true
      void run({ kind: "text", text: autoRunText })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunText, briefId])

  useEffect(() => () => controller.current?.abort(), [])

  const canRun =
    !running && !!briefId && (tab === "text" ? text.trim().length > 0 : tab === "url" ? url.trim().length > 0 : !!file)

  return (
    <section aria-labelledby="prefill-heading" className="rounded-2xl border border-base bg-tertiary/40">
      <h3 id="prefill-heading">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="prefill-body"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[13px] font-semibold text-pri focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {BRIEF_UI_COPY.startFaster}
          <span aria-hidden="true" className="text-mut">
            {open ? "−" : "+"}
          </span>
        </button>
      </h3>
      {open && (
        <div id="prefill-body" className="flex flex-col gap-3 px-4 pb-4">
          <p className="text-[12px] text-mut">{BRIEF_UI_COPY.startFasterHelp}</p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList>
              <TabsTrigger value="text">{BRIEF_UI_COPY.prefillTabs.text}</TabsTrigger>
              <TabsTrigger value="url">{BRIEF_UI_COPY.prefillTabs.url}</TabsTrigger>
              <TabsTrigger value="doc">{BRIEF_UI_COPY.prefillTabs.doc}</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="pt-2">
              <label htmlFor="prefill-text" className="sr-only">
                {BRIEF_UI_COPY.prefillTabs.text}
              </label>
              <Textarea id="prefill-text" rows={4} maxLength={20000} className="text-[13px]" placeholder="Paste notes, a pitch, an email…" value={text} onChange={(e) => setText(e.target.value)} disabled={running} />
            </TabsContent>
            <TabsContent value="url" className="pt-2">
              <label htmlFor="prefill-url" className="sr-only">
                {BRIEF_UI_COPY.prefillTabs.url}
              </label>
              <Input id="prefill-url" type="url" className="text-[13px]" placeholder="https://yoursite.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={running} />
            </TabsContent>
            <TabsContent value="doc" className="pt-2">
              <label htmlFor="prefill-doc" className="text-[12px] text-sec">
                PDF, DOCX, PPTX, TXT or MD up to 10 MB
              </label>
              <input
                id="prefill-doc"
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md,application/pdf,text/plain,text/markdown"
                className="mt-1 block w-full text-[12.5px] text-sec file:mr-3 file:rounded-lg file:border-0 file:bg-bubble file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-pri"
                disabled={running}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > 10 * 1024 * 1024) {
                    setError("Documents can be up to 10 MB")
                    setFile(null)
                    return
                  }
                  setFile(f)
                }}
              />
            </TabsContent>
          </Tabs>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canRun}
              onClick={() => void run({ kind: tab, text, url, file })}
              className="rounded-xl bg-inv px-4 py-2 text-[12.5px] font-semibold text-inv hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40"
            >
              {running ? BRIEF_UI_COPY.prefillWorking : BRIEF_UI_COPY.fillFromThis}
            </button>
            {running && (
              <button type="button" onClick={() => controller.current?.abort()} className="rounded-xl border border-base px-3 py-2 text-[12.5px] font-medium text-sec hover:bg-tertiary focus-visible:ring-[3px] focus-visible:ring-ring/50">
                {BRIEF_UI_COPY.cancel}
              </button>
            )}
            {running && <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent motion-reduce:animate-none" aria-hidden="true" />}
          </div>
          {error && <p className="text-[12.5px] text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
