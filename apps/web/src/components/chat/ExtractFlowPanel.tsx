"use client"

import { useCallback, useState } from "react"
import { useExtractStore } from "@/stores/extractStore"
import { extractApi } from "@/lib/api/services/extract.service"
import { MinimalCreateProjectModal } from "@/components/project/MinimalCreateProjectModal"

// New, standalone home-page flow: describe your idea -> dynamic
// (fully server-driven, not hardcoded to 3) clarifying questions ->
// minimal create form -> project + version created -> /plan SSE stream.
// Deliberately independent of ChatHomeView's existing turn-by-turn
// useClarifyStore/ChatInput wiring, which stays untouched.
export function ExtractFlowPanel() {
  const {
    phase,
    ideaText,
    extracted,
    questions,
    answers,
    error,
    start,
    answerQuestion,
    finish,
    setError,
    reset,
  } = useExtractStore()

  const [draftIdea, setDraftIdea] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const handleStart = useCallback(async () => {
    if (!draftIdea.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await extractApi.extract(draftIdea.trim(), "free")
      start(draftIdea.trim(), result.extracted, result.questions)
      if (result.questions.length === 0) {
        setCreateOpen(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }, [draftIdea, start, setError])

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      answerQuestion(questionId, value)
    },
    [answerQuestion],
  )

  const handleAnswersSubmit = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await extractApi.answer(extracted, answers)
      finish(result.extracted)
      setCreateOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }, [extracted, answers, finish, setError])

  const handleClose = useCallback(() => {
    reset()
    setDraftIdea("")
  }, [reset])

  return (
    <div className="w-full flex flex-col gap-3">
      {phase === "idle" && (
        <div className="flex flex-col gap-2 rounded-2xl border border-base p-4">
          <textarea
            value={draftIdea}
            onChange={(e) => setDraftIdea(e.target.value)}
            placeholder="Describe your startup idea to start the guided setup..."
            rows={2}
            className="w-full resize-none bg-transparent text-sm text-pri placeholder:text-mut outline-none leading-relaxed"
          />
          <button
            onClick={handleStart}
            disabled={!draftIdea.trim() || isLoading}
            className="self-end rounded-xl bg-inv px-4 py-2 text-[12.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {isLoading ? "Thinking..." : "Get started"}
          </button>
        </div>
      )}

      {phase === "questions" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-base p-4">
          {questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-pri">{q.question}</label>
              {q.options && q.options.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleAnswerChange(q.id, opt)}
                      className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                        answers[q.id] === opt
                          ? "border-em bg-bubble text-pri"
                          : "border-base text-sec hover:border-em"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="text"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  placeholder="Type your answer..."
                  className="w-full rounded-lg border border-base bg-transparent px-3 py-2 text-[13px] text-pri placeholder:text-mut outline-none"
                />
              )}
            </div>
          ))}

          <button
            onClick={handleAnswersSubmit}
            disabled={isLoading}
            className="self-end rounded-xl bg-inv px-4 py-2 text-[12.5px] font-semibold text-inv transition-opacity duration-150 hover:opacity-90 disabled:opacity-40 cursor-pointer"
          >
            {isLoading ? "Saving..." : "Continue"}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <MinimalCreateProjectModal
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v)
          if (!v) handleClose()
        }}
      />
    </div>
  )
}
