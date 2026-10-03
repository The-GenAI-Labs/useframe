"use client";
import { useState } from "react";
import { CitationTooltip } from "@/components/webcontainer/CitationTooltip";
type Citation = { id: string; title: string; source: string; url?: string };
export function FindingCitations({ citations }: { citations: Citation[] }) {
  const [hover, setHover] = useState<{ id: string; rect: DOMRect } | null>(
    null,
  );
  return (
    <div className="flex flex-wrap gap-2">
      {citations.map((citation) => (
        <a
          key={citation.id}
          href={
            citation.url && /^https?:\/\//i.test(citation.url)
              ? citation.url
              : `/research/${encodeURIComponent(citation.id)}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-base px-2 py-1 text-xs text-sec focus-visible:outline-2 focus-visible:outline-blue-500"
          onMouseEnter={(event) =>
            setHover({
              id: citation.id,
              rect: event.currentTarget.getBoundingClientRect(),
            })
          }
          onMouseLeave={() => setHover(null)}
          onFocus={(event) =>
            setHover({
              id: citation.id,
              rect: event.currentTarget.getBoundingClientRect(),
            })
          }
          onBlur={() => setHover(null)}
          aria-label={`Citation: ${citation.title}`}
        >
          {citation.title}
        </a>
      ))}
      {hover && (
        <CitationTooltip
          citationIds={[hover.id]}
          citations={citations}
          rect={hover.rect}
        />
      )}
    </div>
  );
}
