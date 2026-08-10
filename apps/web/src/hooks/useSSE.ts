"use client"

import { useCallback, useRef } from "react"
import type { SSEEvent } from "@repo/schemas"

type SSEOptions = {
  onEvent: (event: SSEEvent) => void
  onError?: (err: Error) => void
  onDone?: () => void
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null)

  const connect = useCallback(
    async (url: string, body: Record<string, unknown>, opts: SSEOptions) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const accessToken = await getAccessToken()
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split("\n\n")
          buffer = parts.pop() ?? ""

          for (const part of parts) {
            if (!part.trim()) continue
            const lines = part.split("\n")
            let eventType = "message"
            let dataStr = ""

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim()
              } else if (line.startsWith("data: ")) {
                dataStr = line.slice(6).trim()
              }
            }

            if (!dataStr) continue
            try {
              const data = JSON.parse(dataStr)
              opts.onEvent({ type: eventType, ...data } as SSEEvent)
            } catch {
            }
          }
        }

        opts.onDone?.()
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        opts.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    },
    []
  )

  const disconnect = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  return { connect, disconnect }
}

async function getAccessToken(): Promise<string> {
  try {
    const res = await fetch("/api/token")
    if (!res.ok) return ""
    const { accessToken } = (await res.json()) as { accessToken?: string }
    return accessToken ?? ""
  } catch {
    return ""
  }
}
