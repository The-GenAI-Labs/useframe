import { create } from "zustand"
import type { ClarifyQuestion, ProjectInputType } from "@repo/schemas"

export type ClarifyTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }

export type ClarifyPhase = "idle" | "clarifying" | "generating"

interface ClarifyState {
  phase: ClarifyPhase
  startupIdea: string
  turns: ClarifyTurn[]
  pendingQuestions: ClarifyQuestion[]
  answers: Record<string, string>
  inferredName: string | null
  inferredNiche: string | null
  inferredTargetAudience: string | null
  inputType: ProjectInputType
  sourceUrl: string | null
  error: string | null

  startIdea: (idea: string) => void
  setQuestions: (questions: ClarifyQuestion[], inferred: { name?: string; niche?: string; targetAudience?: string }) => void
  answerQuestion: (questionId: string, answer: string) => void
  setInputType: (inputType: ProjectInputType) => void
  setSourceUrl: (url: string | null) => void
  setGenerating: () => void
  setError: (message: string) => void
  reset: () => void
}

const initial = {
  phase: "idle" as ClarifyPhase,
  startupIdea: "",
  turns: [] as ClarifyTurn[],
  pendingQuestions: [] as ClarifyQuestion[],
  answers: {} as Record<string, string>,
  inferredName: null as string | null,
  inferredNiche: null as string | null,
  inferredTargetAudience: null as string | null,
  inputType: "FROM_SCRATCH" as ProjectInputType,
  sourceUrl: null as string | null,
  error: null as string | null,
}

export const useClarifyStore = create<ClarifyState>()((set) => ({
  ...initial,

  startIdea: (idea) =>
    set({
      phase: "clarifying",
      startupIdea: idea,
      turns: [{ role: "user", content: idea }],
    }),

  setQuestions: (questions, inferred) =>
    set((s) => ({
      pendingQuestions: questions,
      inferredName: inferred.name ?? s.inferredName,
      inferredNiche: inferred.niche ?? s.inferredNiche,
      inferredTargetAudience: inferred.targetAudience ?? s.inferredTargetAudience,
      turns:
        questions.length > 0
          ? [...s.turns, { role: "assistant", content: questions.map((q) => q.question).join(" ") }]
          : s.turns,
    })),

  answerQuestion: (questionId, answer) =>
    set((s) => ({
      answers: { ...s.answers, [questionId]: answer },
      turns: [...s.turns, { role: "user", content: answer }],
    })),

  setInputType: (inputType) => set({ inputType }),
  setSourceUrl: (url) => set({ sourceUrl: url }),
  setGenerating: () => set({ phase: "generating" }),
  setError: (message) => set({ error: message }),
  reset: () => set(initial),
}))
