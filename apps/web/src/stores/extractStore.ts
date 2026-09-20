import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { ClarifyQuestion, ExtractedFields } from "@repo/schemas"

// Standalone home-page "describe your idea -> dynamic questions -> minimal
// create form" flow (see apps/orchestrator-service's /extract routes). This
// is intentionally separate from useClarifyStore, which drives the existing
// turn-by-turn chat clarify flow in ChatHomeView — that flow is left
// untouched. Persisted to localStorage (matching useModelStore's pattern)
// so the idea/answers survive a redirect through the auth popup before the
// minimal create form is submitted.
export type ExtractPhase = "idle" | "questions" | "ready"

interface ExtractState {
  phase: ExtractPhase
  ideaText: string
  extracted: ExtractedFields
  questions: ClarifyQuestion[]
  answers: Record<string, string>
  error: string | null

  start: (ideaText: string, extracted: ExtractedFields, questions: ClarifyQuestion[]) => void
  answerQuestion: (questionId: string, answer: string) => void
  finish: (extracted: ExtractedFields) => void
  setError: (message: string | null) => void
  reset: () => void
}

const initial = {
  phase: "idle" as ExtractPhase,
  ideaText: "",
  extracted: {} as ExtractedFields,
  questions: [] as ClarifyQuestion[],
  answers: {} as Record<string, string>,
  error: null as string | null,
}

export const useExtractStore = create<ExtractState>()(
  persist(
    (set) => ({
      ...initial,

      start: (ideaText, extracted, questions) =>
        set({
          phase: questions.length > 0 ? "questions" : "ready",
          ideaText,
          extracted,
          questions,
          answers: {},
          error: null,
        }),

      answerQuestion: (questionId, answer) =>
        set((s) => ({ answers: { ...s.answers, [questionId]: answer } })),

      finish: (extracted) => set({ phase: "ready", extracted }),

      setError: (message) => set({ error: message }),

      reset: () => set(initial),
    }),
    { name: "uf-extract" },
  ),
)
