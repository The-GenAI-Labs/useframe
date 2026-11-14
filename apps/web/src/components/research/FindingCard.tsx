import Link from "next/link";
import type { FindingListItem, LockedFindingItem } from "@repo/schemas";
import { categoryLabel } from "@/lib/researchCategories";

const cardClass = "flex h-full flex-col gap-2 rounded-2xl border border-base bg-surface p-4";

function sourceLine(source: { year: number | null; venue: string | null } | null): string | null {
  if (!source) return null;
  return [source.venue, source.year].filter(Boolean).join(" · ") || null;
}

export function CategoryChip({ category }: { category: string }) {
  return (
    <span className="w-fit rounded-full bg-tertiary px-2.5 py-0.5 text-[11px] font-semibold text-sec">
      {categoryLabel(category)}
    </span>
  );
}

export function FindingCard({ finding }: { finding: FindingListItem }) {
  const source = sourceLine(finding.source);
  return (
    <Link
      href={`/research/library/${finding.slug}`}
      className={`${cardClass} transition-colors hover:border-em focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
    >
      <CategoryChip category={finding.category} />
      <span className="text-[14px] font-semibold leading-snug text-pri">{finding.title}</span>
      <span className="line-clamp-3 text-[12.5px] leading-relaxed text-sec">{finding.excerpt}</span>
      {(source || finding.tags.length > 0) && (
        <span className="mt-auto flex flex-col gap-1 pt-2 text-[11px] text-mut">
          {source && <span>{source}</span>}
          {finding.tags.length > 0 && <span>{finding.tags.slice(0, 4).join(" · ")}</span>}
        </span>
      )}
    </Link>
  );
}

export function LockedFindingCard({ finding }: { finding: LockedFindingItem }) {
  const source = sourceLine(finding.source);
  return (
    <div className={`${cardClass} opacity-90`} aria-label={`${finding.title}, locked`}>
      <div className="flex items-center justify-between gap-2">
        <CategoryChip category={finding.category} />
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-mut"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </div>
      <span className="text-[14px] font-semibold leading-snug text-pri">{finding.title}</span>
      {source && <span className="mt-auto pt-2 text-[11px] text-mut">{source}</span>}
    </div>
  );
}
