"use client"

import { useCallback } from "react"
import type { ClarifyResponse } from "@repo/schemas"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

export function useClarify() {
  const clarify = useCallback(
    async (startupIdea: string, answers?: Record<string, string>): Promise<ClarifyResponse> => {
      const tokenRes = await fetch("/api/token")
      const { accessToken } = (await tokenRes.json()) as { accessToken?: string }

      const res = await fetch(`${ORCHESTRATOR_URL}/clarify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken ?? ""}`,
        },
        body: JSON.stringify({ startupIdea, answers }),
      })

      const body = (await res.json()) as { success: boolean; data?: ClarifyResponse; message?: string }
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.message ?? "Failed to get clarifying questions")
      }
      return body.data
    },
    [],
  )

  return { clarify }
}
