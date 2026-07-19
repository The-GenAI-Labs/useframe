"use client"

import { useGenerationStore } from "@/stores/generationStore"

const STAGE_LABELS: Record<string, string> = {
  RESEARCH: "Querying research corpus",
  GENERATE: "Building page structure",
  COPY: "Writing conversion copy",
  DESIGN: "Applying design system",
  SEO: "Optimising for search",
  CRITIQUE: "Running critique pass",
  COMPLETE: "Generation complete",
  SCAN: "Scanning site",
  FAILED: "Generation failed",
}

export function GenerationStream() {
  const { currentStage, stageMessage, streamBuffer, isStreaming, error } =
    useGenerationStore()

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Generation failed</p>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!isStreaming && !currentStage) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-muted-foreground">
        <p className="text-sm">Waiting to start generation...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {currentStage && (
        <div className="border-b border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            {isStreaming && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
            )}
            <span className="text-sm font-medium">
              {STAGE_LABELS[currentStage] ?? stageMessage}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
          {streamBuffer}
        </pre>
      </div>
    </div>
  )
}
