"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { mediaApi, type MediaItem } from "@/lib/api/services/media.service"

export type UploadPhase = "uploading" | "verifying" | "processing" | "done" | "failed" | "cancelled"

export type UploadEntry = {
  id: string
  name: string
  kind: "image" | "video"
  progress: number
  phase: UploadPhase
  message?: string
  code?: string
  assetId?: string
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
}

export const ACCEPTED_MEDIA = Object.keys(MIME_BY_EXT)
  .map((ext) => `.${ext}`)
  .join(",")

// Hash only small files: it lets the server return an identical earlier upload.
const HASH_LIMIT_BYTES = 25 * 1024 * 1024
const POLL_START_MS = 2000
const POLL_MAX_MS = 10_000

export function mimeFor(file: File): string {
  if (file.type) return file.type
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  return MIME_BY_EXT[ext] ?? "application/octet-stream"
}

async function sha256(file: File): Promise<string | undefined> {
  if (file.size > HASH_LIMIT_BYTES || !globalThis.crypto?.subtle) return undefined
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function putFile(url: string, headers: Record<string, string>, file: File, onProgress: (pct: number) => void) {
  const xhr = new XMLHttpRequest()
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url)
    // Content-Length is set by the browser from the body and is a forbidden header here.
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== "content-length") xhr.setRequestHeader(key, value)
    }
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("The upload was refused")))
    xhr.onerror = () => reject(new Error("The upload failed. Check your connection and try again."))
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))
    xhr.send(file)
  })
  return { xhr, done }
}

export function useMediaUploads(slug: string, onChange: () => void) {
  const [uploads, setUploads] = useState<UploadEntry[]>([])
  const xhrs = useRef(new Map<string, XMLHttpRequest>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const alive = useRef(true)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    alive.current = true
    const pendingXhrs = xhrs.current
    const pendingTimers = timers.current
    return () => {
      alive.current = false
      for (const xhr of pendingXhrs.values()) xhr.abort()
      for (const timer of pendingTimers.values()) clearTimeout(timer)
      pendingXhrs.clear()
      pendingTimers.clear()
    }
  }, [slug])

  const patch = useCallback((id: string, next: Partial<UploadEntry>) => {
    if (!alive.current) return
    setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...next } : u)))
  }, [])

  const poll = useCallback(
    (id: string, assetId: string, delay = POLL_START_MS) => {
      const timer = setTimeout(async () => {
        timers.current.delete(id)
        if (!alive.current) return
        try {
          const asset = await mediaApi.get(slug, assetId)
          if (asset.status === "READY" || asset.status === "FAILED") {
            patch(id, asset.status === "READY" ? { phase: "done" } : { phase: "failed", message: asset.failureReason ?? undefined })
            onChangeRef.current()
            return
          }
        } catch {
          // Transient; keep polling with backoff.
        }
        poll(id, assetId, Math.min(Math.round(delay * 1.5), POLL_MAX_MS))
      }, delay)
      timers.current.set(id, timer)
    },
    [slug, patch]
  )

  const uploadOne = useCallback(
    async (file: File) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const mime = mimeFor(file)
      setUploads((list) => [
        { id, name: file.name, kind: mime.startsWith("video/") ? "video" : "image", progress: 0, phase: "uploading" },
        ...list,
      ])
      try {
        const started = await mediaApi.startUpload(slug, {
          filename: file.name,
          mime,
          bytes: file.size,
          sha256: await sha256(file),
        })
        if (started.duplicate) {
          patch(id, { phase: "done", progress: 100, assetId: started.assetId, message: "Already in your library" })
          onChangeRef.current()
          return
        }
        patch(id, { assetId: started.assetId })
        const { xhr, done } = putFile(started.upload.url, started.upload.headers, file, (progress) => patch(id, { progress }))
        xhrs.current.set(id, xhr)
        await done
        xhrs.current.delete(id)
        patch(id, { phase: "verifying", progress: 100 })
        const asset: MediaItem = await mediaApi.completeUpload(slug, started.assetId)
        onChangeRef.current()
        if (asset.status === "READY") patch(id, { phase: "done" })
        else {
          patch(id, { phase: "processing" })
          poll(id, started.assetId)
        }
      } catch (err) {
        xhrs.current.delete(id)
        if (err instanceof DOMException && err.name === "AbortError") {
          patch(id, { phase: "cancelled" })
          return
        }
        const e = err as Error & { code?: string }
        patch(id, { phase: "failed", message: e.message, code: e.code })
        onChangeRef.current()
      }
    },
    [slug, patch, poll]
  )

  const add = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) void uploadOne(file)
  }, [uploadOne])

  const cancel = useCallback((id: string) => {
    xhrs.current.get(id)?.abort()
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setUploads((list) => list.map((u) => (u.id === id && u.phase !== "done" ? { ...u, phase: "cancelled" } : u)))
  }, [])

  const dismiss = useCallback((id: string) => setUploads((list) => list.filter((u) => u.id !== id)), [])

  return { uploads, add, cancel, dismiss }
}
