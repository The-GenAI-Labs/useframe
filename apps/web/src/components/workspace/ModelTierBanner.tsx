"use client";

import Link from "next/link";

type Props = {
    generationTier: "FREE" | "PAID";
};

// Shown identically regardless of the account's signup risk tier (ALLOW vs
// SUSPICIOUS) — risk scoring only ever affects whether the free generation
// grant happens at all (server-side, in GenerateService.authorize()), never
// the wording shown here. There is nothing in this banner for anyone to
// learn from, on purpose.
export function ModelTierBanner({ generationTier }: Props) {
    if (generationTier !== "FREE") return null;

    return (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-base bg-tertiary shrink-0">
            <span className="text-[12.5px] text-mut">
                You&apos;re using our standard model.
            </span>
            <Link
                href="/billing"
                className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-linear-to-br from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 transition-all shrink-0"
            >
                Upgrade to Pro for our best model
            </Link>
        </div>
    );
}
