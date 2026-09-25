"use client"

import { useCallback, useState } from "react"

type Props = {
  onSubmit: (content: string) => Promise<unknown>
  disabled?: boolean
}

export function BuildChatBar({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("")
  const [isSending, setIsSending] = useState(false)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const content = value.trim()
      if (!content || isSending || disabled) return

      setIsSending(true)
      setValue("")
      try {
        await onSubmit(content)
      } finally {
        setIsSending(false)
      }
    },
    [value, isSending, disabled, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit]
  )

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl items-end gap-2">
      <div className="flex-1 rounded-2xl border border-base bg-surface px-4 py-2.5 shadow-sm focus-within:border-em transition-all">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Waiting for the preview…" : "Tell it what to change…"}
          rows={1}
          disabled={disabled || isSending}
          className="w-full resize-none bg-transparent text-[13.5px] text-pri placeholder:text-mut outline-none disabled:opacity-60"
        />
      </div>
      <button
        type="submit"
        disabled={disabled || isSending || !value.trim()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
        style={{ backgroundColor: "var(--text-primary)" }}
        aria-label="Send"
      >
        {isSending ? (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        )}
      </button>
    </form>
  )
}
