"use client";
import { useEffect, useState } from "react";
import type { SSEEvent } from "@repo/schemas";
import { useSSE } from "./useSSE";
type ValidationStatus = Extract<SSEEvent, { type: "validation_status" }>;
export function useValidationStatus(
  pipeline: "MAIN" | "REPLICATE",
  slug: string,
) {
  const { connect, disconnect } = useSSE();
  const [state, setState] = useState<ValidationStatus | null>(null);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    setState(null);
    const start = () => {
      if (stopped) return;
      void connect(
        `${process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000"}/api/validation/stream`,
        { pipeline, slug },
        {
          onEvent: (event) => {
            if (!stopped && event.type === "validation_status") {
              failures = 0;
              setState(event);
            }
          },
          onDone: () => {
            if (!stopped) timer = setTimeout(start, 5000);
          },
          onError: (error) => {
            console.warn("Quality status unavailable", error.message);
            if (!stopped && ++failures < 5)
              timer = setTimeout(start, Math.min(30000, 5000 * failures));
          },
        },
      );
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      disconnect();
    };
  }, [pipeline, slug, connect, disconnect]);
  return state;
}
