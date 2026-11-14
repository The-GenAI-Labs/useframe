"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { FindingDetail } from "@repo/schemas";
import { apiErrorStatus, isResearchLocked, researchLibraryApi } from "@/lib/api/services/researchLibrary.service";
import { paperLink } from "@/lib/researchCategories";
import { CategoryChip } from "./FindingCard";
import { FindingStatement } from "./FindingStatement";
import { RESEARCH_SUMMARY_NOTE, UpgradeBanner } from "./UpgradeBanner";

const RELATION_LABELS: Record<FindingDetail["related"][number]["relationType"], string> = {
  SUPPORTS: "Supports",
  CONFLICTS: "Conflicts with",
  REFINES: "Refines",
  OFTEN_CITED_TOGETHER: "Often cited together",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8 md:px-10">
        <Link href="/research/library" className="w-fit text-[12.5px] text-mut underline-offset-2 hover:text-sec hover:underline">
          ← Research Library
        </Link>
        {children}
      </div>
    </div>
  );
}

function FindingBody({ finding }: { finding: FindingDetail }) {
  const href = finding.source ? paperLink(finding.source) : null;
  const meta = finding.source ? [finding.source.authors, finding.source.venue, finding.source.year].filter(Boolean).join(" · ") : "";
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={finding.category} />
          {finding.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-base px-2 py-0.5 text-[11px] text-mut">
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-pri">{finding.title}</h1>
        {finding.reuseCount > 0 && (
          <p className="text-[12px] text-mut">
            Cited in {finding.reuseCount} project{finding.reuseCount === 1 ? "" : "s"}
          </p>
        )}
      </header>

      <FindingStatement statement={finding.statement} />

      {finding.appliesWhen && (
        <section aria-labelledby="applies-when" className="flex flex-col gap-1.5">
          <h2 id="applies-when" className="text-[11px] font-semibold uppercase tracking-wide text-mut">
            Applies when
          </h2>
          <p className="text-[13px] leading-relaxed text-sec">{finding.appliesWhen}</p>
        </section>
      )}

      {finding.source && (
        <section aria-labelledby="finding-source" className="flex flex-col gap-2 rounded-2xl border border-base bg-surface p-4">
          <h2 id="finding-source" className="text-[11px] font-semibold uppercase tracking-wide text-mut">
            Source
          </h2>
          <p className="text-[14px] font-semibold text-pri">{finding.source.title}</p>
          {meta && <p className="text-[12px] text-sec">{meta}</p>}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="w-fit text-[12.5px] font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
            >
              Open the paper<span className="sr-only"> (opens in a new tab)</span> ↗
            </a>
          )}
        </section>
      )}

      {finding.related.length > 0 && (
        <section aria-labelledby="related-findings" className="flex flex-col gap-2">
          <h2 id="related-findings" className="text-[11px] font-semibold uppercase tracking-wide text-mut">
            Related findings
          </h2>
          <ul className="flex flex-col gap-1.5">
            {finding.related.map((r) => (
              <li key={r.slug} className="text-[13px]">
                <span className="text-mut">{RELATION_LABELS[r.relationType]}: </span>
                <Link href={`/research/library/${r.slug}`} className="font-medium text-sec underline underline-offset-2 hover:text-pri">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-base pt-4 text-[11.5px] text-mut">{RESEARCH_SUMMARY_NOTE}</p>
    </article>
  );
}

export default function FindingDetailView({ slug }: { slug: string }) {
  const finding = useQuery({
    queryKey: ["research-library", "finding", slug],
    queryFn: () => researchLibraryApi.detail(slug),
    retry: (count, error) => ![403, 404].includes(apiErrorStatus(error) ?? 0) && count < 2,
  });
  const lockedError = finding.isError && isResearchLocked(finding.error);
  const access = useQuery({
    queryKey: ["research-library", "access"],
    queryFn: researchLibraryApi.access,
    staleTime: 60_000,
    enabled: lockedError,
  });

  if (finding.isPending)
    return (
      <Shell>
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading finding</span>
          <div className="h-5 w-28 animate-pulse rounded-full bg-tertiary" />
          <div className="h-7 w-4/5 animate-pulse rounded bg-tertiary" />
          <div className="h-4 w-full animate-pulse rounded bg-tertiary" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-tertiary" />
        </div>
      </Shell>
    );

  if (lockedError)
    return (
      <Shell>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-pri">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <h1 className="text-xl font-semibold">This finding is locked</h1>
          </div>
          <UpgradeBanner planName={access.data?.upgradePlanName ?? null} />
        </div>
      </Shell>
    );

  if (finding.isError)
    return (
      <Shell>
        {apiErrorStatus(finding.error) === 404 ? (
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold text-pri">Finding not found</h1>
            <p className="text-[13px] text-mut">It may have been retired, or the link is wrong.</p>
          </div>
        ) : (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-[13px] text-sec">We couldn&apos;t load this finding.</p>
            <button
              type="button"
              onClick={() => finding.refetch()}
              className="cursor-pointer rounded-xl bg-blue-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Try again
            </button>
          </div>
        )}
      </Shell>
    );

  return (
    <Shell>
      <FindingBody finding={finding.data} />
    </Shell>
  );
}
