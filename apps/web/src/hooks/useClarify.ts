"use client"

import { useCallback } from "react"
import type { ClarifyResponse } from "@repo/schemas"
import { getCurrentAccessToken } from "@/lib/authContext"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

export function useClarify() {
  const clarify = useCallback(
    async (startupIdea: string, answers?: Record<string, string>): Promise<ClarifyResponse> => {
      const accessToken = getCurrentAccessToken() ?? ""

      const res = await fetch(`${ORCHESTRATOR_URL}/clarify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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
