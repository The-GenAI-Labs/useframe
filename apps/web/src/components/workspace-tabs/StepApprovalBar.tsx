"use client"

import { useState } from "react"

type Props = {
  onApprove: () => void
  onReject: (feedback: string) => void
  isApproving?: boolean
  isRejecting?: boolean
  approveLabel?: string
  rejectLabel?: string
}

export function StepApprovalBar({
  onApprove,
  onReject,
  isApproving,
  isRejecting,
  approveLabel = "Approve",
  rejectLabel = "Reject & regenerate",
}: Props) {
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState("")

  const busy = isApproving || isRejecting

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl border border-base bg-surface shadow-sm">
      {showFeedback ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What should change?"
            rows={3}
            autoFocus
            className="w-full rounded-xl border border-base bg-tertiary px-3 py-2 text-[12.5px] text-sec placeholder:text-mut outline-none resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowFeedback(false)
                setFeedback("")
              }}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-mut hover:text-sec transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onReject(feedback)}
              disabled={busy || !feedback.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-semibold hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRejecting ? "Submitting…" : "Submit feedback"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-mut">Review this before moving on.</p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowFeedback(true)}
              disabled={busy}
              className="px-3.5 py-1.5 rounded-lg border border-base text-[12px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer disabled:opacity-50"
            >
              {rejectLabel}
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={busy}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
            >
              {isApproving ? "Approving…" : approveLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
