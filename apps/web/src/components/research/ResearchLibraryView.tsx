"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ResearchCategory } from "@repo/schemas";
import { researchLibraryApi } from "@/lib/api/services/researchLibrary.service";
import { categoryLabel } from "@/lib/researchCategories";
import { FindingCard, LockedFindingCard } from "./FindingCard";
import { RESEARCH_SUMMARY_NOTE, UpgradeBanner } from "./UpgradeBanner";

const tabClass =
  "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";

function SkeletonGrid() {
  return (
    <ul aria-hidden="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="flex flex-col gap-2 rounded-2xl border border-base bg-surface p-4">
          <div className="h-4 w-24 animate-pulse rounded-full bg-tertiary" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-tertiary" />
          <div className="h-3 w-full animate-pulse rounded bg-tertiary" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-tertiary" />
        </li>
      ))}
    </ul>
  );
}

export default function ResearchLibraryView() {
  const searchId = useId();
  const [category, setCategory] = useState<ResearchCategory | undefined>();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(timer);
  }, [input]);

  const access = useQuery({ queryKey: ["research-library", "access"], queryFn: researchLibraryApi.access, staleTime: 60_000 });
  const categories = useQuery({ queryKey: ["research-library", "categories"], queryFn: researchLibraryApi.categories, staleTime: 60_000 });
  const findings = useInfiniteQuery({
    queryKey: ["research-library", "findings", category ?? null, q],
    queryFn: ({ pageParam }) => researchLibraryApi.list({ category, q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const pages = findings.data?.pages ?? [];
  const locked = pages[0]?.locked ?? access.data?.hasFullAccess === false;
  const total = (categories.data ?? []).reduce((sum, c) => sum + c.count, 0);
  const shown = pages.reduce((sum, p) => sum + p.items.length, 0);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 md:px-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-pri">Research Library</h1>
          <p className="text-sm text-mut">
            Structured findings from published design research, each with its source.{" "}
            <Link href="/research" className="underline underline-offset-2 hover:text-sec">
              Read the articles
            </Link>
          </p>
        </header>

        {access.data && !access.data.hasFullAccess && <UpgradeBanner planName={access.data.upgradePlanName} />}

        <div className="flex flex-col gap-3">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-1">
            <label htmlFor={searchId} className="text-[12px] font-medium text-sec">
              Search findings{locked ? " by title or tag" : ""}
            </label>
            <input
              id={searchId}
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={200}
              placeholder="e.g. contrast, trust badges, line length"
              className="h-10 w-full rounded-xl border border-base bg-surface px-3 text-[13px] text-pri placeholder:text-mut outline-none focus-visible:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-100 dark:focus-visible:ring-blue-900/40"
            />
          </form>

          <div role="group" aria-label="Filter by category" className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <button
              type="button"
              aria-pressed={category === undefined}
              onClick={() => setCategory(undefined)}
              className={`${tabClass} ${category === undefined ? "border-blue-500 bg-blue-500 text-white" : "border-base text-sec hover:border-em"}`}
            >
              All{categories.data ? ` (${total})` : ""}
            </button>
            {(categories.data ?? []).map((c) => (
              <button
                key={c.category}
                type="button"
                aria-pressed={category === c.category}
                onClick={() => setCategory(c.category)}
                className={`${tabClass} ${category === c.category ? "border-blue-500 bg-blue-500 text-white" : "border-base text-sec hover:border-em"}`}
              >
                {categoryLabel(c.category)} ({c.count})
              </button>
            ))}
          </div>
        </div>

        <div aria-live="polite" aria-busy={findings.isFetching} className="flex flex-col gap-4">
          {findings.isPending ? (
            <>
              <span className="sr-only">Loading findings</span>
              <SkeletonGrid />
            </>
          ) : findings.isError ? (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-base bg-surface px-4 py-8 text-center">
              <p className="text-[13px] text-sec">We couldn&apos;t load the research library.</p>
              <button
                type="button"
                onClick={() => findings.refetch()}
                className="cursor-pointer rounded-xl bg-blue-500 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Try again
              </button>
            </div>
          ) : shown === 0 ? (
            <p className="rounded-2xl border border-base bg-surface px-4 py-8 text-center text-[13px] text-sec">
              {q ? `No findings match "${q}".` : "No findings in this category yet."}
            </p>
          ) : (
            <>
              <p className="text-[12px] text-mut">
                Showing {shown} finding{shown === 1 ? "" : "s"}
                {q ? ` for "${q}"` : ""}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pages.flatMap((page, p) =>
                  page.locked
                    ? page.items.map((item, i) => (
                        <li key={`${p}-${i}`}>
                          <LockedFindingCard finding={item} />
                        </li>
                      ))
                    : page.items.map((item) => (
                        <li key={item.slug}>
                          <FindingCard finding={item} />
                        </li>
                      )),
                )}
              </ul>
              {findings.hasNextPage && (
                <button
                  type="button"
                  onClick={() => findings.fetchNextPage()}
                  disabled={findings.isFetchingNextPage}
                  className="mx-auto cursor-pointer rounded-xl border border-base px-4 py-2 text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  {findings.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              )}
            </>
          )}
        </div>

        <p className="text-[11.5px] text-mut">{RESEARCH_SUMMARY_NOTE}</p>
      </div>
    </div>
  );
}
