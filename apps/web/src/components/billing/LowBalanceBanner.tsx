"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { creditsApi } from "@/lib/api/services/credits.service";

const LOW_BALANCE_THRESHOLD = 5;

export function LowBalanceBanner() {
    const { data: summary } = useQuery({
        queryKey: ["credits-summary"],
        queryFn: () => creditsApi.getSummary(),
        refetchInterval: 30000,
    });

    if (summary == null || summary.balance >= LOW_BALANCE_THRESHOLD) return null;

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 shrink-0">
            <div className="flex items-center gap-2 text-[12.5px] text-amber-700 dark:text-amber-400">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="font-medium">Low on credits — {summary.balance} left</span>
            </div>
            <Link
                href="/billing"
                className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-linear-to-br from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 transition-all shrink-0"
            >
                Top up
            </Link>
        </div>
    );
}
