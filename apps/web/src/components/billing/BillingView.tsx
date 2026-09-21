"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { creditsApi } from "@/lib/api/services/credits.service";
import { billingApi } from "@/lib/api/services/billing.service";
import { serif } from "@/components/home/fonts";
import { CheckoutForm } from "./CheckoutForm";
import { AddCardForm } from "./AddCardForm";
import { CrossLineBackground } from "@/components/web-score/CrossLineBackground";
import {
    CREDIT_PACKS,
    CUSTOM_MIN_AMOUNT_CENTS,
    creditsForCustomAmount,
    findCreditPack,
} from "@repo/schemas";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "");

// Fixed packs plus a custom-amount path. CREDIT_PACKS and the custom rate
// are imported from @repo/schemas — the same source billing-service's
// checkout validates against — so what's shown here is what checkout grants.
function formatRate(amountCents: number, credits: number): string {
    return `$${(amountCents / 100 / credits).toFixed(2)}/credit`;
}

type PackTier = {
    name: string;
    tagline: string;
    amountCents: number;
    credits: number;
    rate: string;
    gradient: string;
    featured?: boolean;
};

const PACK_PRESENTATION: Record<number, { name: string; tagline: string; gradient: string; featured?: boolean }> = {
    1900: {
        name: "Starter",
        tagline: "One real site, fully iterated",
        gradient: "from-sky-400 via-blue-400 to-blue-600",
    },
    4900: {
        name: "Builder",
        tagline: "A couple of sites, room to explore",
        gradient: "from-blue-500 via-blue-600 to-indigo-700",
    },
    9900: {
        name: "Studio",
        tagline: "Best rate, for shipping regularly",
        gradient: "from-indigo-500 via-blue-700 to-slate-800",
        featured: true,
    },
};

const PACK_TIERS: PackTier[] = CREDIT_PACKS.map((pack) => ({
    ...PACK_PRESENTATION[pack.amountCents]!,
    amountCents: pack.amountCents,
    credits: pack.credits,
    rate: formatRate(pack.amountCents, pack.credits),
}));

const THRESHOLD_OPTIONS_CENTS = [500, 1000, 1500, 2500];
const TOPUP_OPTIONS_CENTS = [1000, 1500, 2500, 5000];

function formatDollars(cents: number): string {
    return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

export default function BillingView() {
    const queryClient = useQueryClient();

    const { data: summary } = useQuery({
        queryKey: ["credits-summary"],
        queryFn: () => creditsApi.getSummary(),
    });

    const invalidateSummary = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["credits-summary"] });
    }, [queryClient]);

    const [selectedAmount, setSelectedAmount] = useState<number>(1900);
    const [customAmount, setCustomAmount] = useState("");
    const [checkoutSecret, setCheckoutSecret] = useState<string | null>(null);
    const [checkoutCredits, setCheckoutCredits] = useState(0);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [startingCheckout, setStartingCheckout] = useState(false);

    const [addCardSecret, setAddCardSecret] = useState<string | null>(null);
    const [addCardError, setAddCardError] = useState<string | null>(null);
    const [startingAddCard, setStartingAddCard] = useState(false);

    const [autoReloadEnabled, setAutoReloadEnabled] = useState(false);
    const [thresholdCents, setThresholdCents] = useState(THRESHOLD_OPTIONS_CENTS[0]!);
    const [topUpToCents, setTopUpToCents] = useState(TOPUP_OPTIONS_CENTS[1]!);
    const [autoReloadSaving, setAutoReloadSaving] = useState(false);
    const [autoReloadError, setAutoReloadError] = useState<string | null>(null);
    const [autoReloadSynced, setAutoReloadSynced] = useState(false);

    useEffect(() => {
        if (autoReloadSynced || !summary?.autoReload) return;
        const { enabled, thresholdCents: t, topUpToCents: u } = summary.autoReload;
        setAutoReloadEnabled(enabled);
        if (t) setThresholdCents(t);
        if (u) setTopUpToCents(u);
        setAutoReloadSynced(true);
    }, [summary, autoReloadSynced]);

    // A pack purchase is identified by packId; a typed custom amount always
    // prices at the custom rate even if it happens to equal a pack's price,
    // matching how checkout validates it server-side.
    const isCustom = customAmount.length > 0;
    const amountCents = isCustom ? Math.round(Number(customAmount) * 100) : selectedAmount;
    const selectedPack = isCustom ? undefined : findCreditPack(selectedAmount);
    const liveCredits =
        amountCents > 0
            ? (selectedPack?.credits ?? creditsForCustomAmount(amountCents))
            : 0;

    const handleStartCheckout = useCallback(async () => {
        if (isCustom && amountCents < CUSTOM_MIN_AMOUNT_CENTS) {
            setCheckoutError("Minimum top-up is $10");
            return;
        }
        setStartingCheckout(true);
        setCheckoutError(null);
        try {
            const { clientSecret, credits } = await billingApi.createCheckout(
                isCustom ? { amountCents } : { packId: selectedAmount },
            );
            setCheckoutSecret(clientSecret);
            setCheckoutCredits(credits);
        } catch (err) {
            setCheckoutError(err instanceof Error ? err.message : "Couldn't start checkout");
        } finally {
            setStartingCheckout(false);
        }
    }, [amountCents, isCustom, selectedAmount]);

    const handleCheckoutSuccess = useCallback(() => {
        setCheckoutSecret(null);
        setCustomAmount("");
        invalidateSummary();
    }, [invalidateSummary]);

    const handleStartAddCard = useCallback(async () => {
        setStartingAddCard(true);
        setAddCardError(null);
        try {
            const { clientSecret } = await billingApi.createSetupIntent();
            setAddCardSecret(clientSecret);
        } catch (err) {
            setAddCardError(err instanceof Error ? err.message : "Couldn't start card setup");
        } finally {
            setStartingAddCard(false);
        }
    }, []);

    const handleAddCardSuccess = useCallback(() => {
        setAddCardSecret(null);
        invalidateSummary();
    }, [invalidateSummary]);

    const handleToggleAutoReload = useCallback(
        async (next: boolean) => {
            setAutoReloadEnabled(next);
            setAutoReloadError(null);
            setAutoReloadSaving(true);
            try {
                await billingApi.putAutoReload({ enabled: next, thresholdCents, topUpToCents });
                invalidateSummary();
            } catch (err) {
                setAutoReloadEnabled(!next);
                setAutoReloadError(
                    err instanceof Error ? err.message : "Add a saved card before enabling auto-reload"
                );
            } finally {
                setAutoReloadSaving(false);
            }
        },
        [thresholdCents, topUpToCents, invalidateSummary]
    );

    const handleSaveAutoReloadSettings = useCallback(async () => {
        setAutoReloadSaving(true);
        setAutoReloadError(null);
        try {
            await billingApi.putAutoReload({ enabled: autoReloadEnabled, thresholdCents, topUpToCents });
            invalidateSummary();
        } catch (err) {
            setAutoReloadError(err instanceof Error ? err.message : "Couldn't save auto-reload settings");
        } finally {
            setAutoReloadSaving(false);
        }
    }, [autoReloadEnabled, thresholdCents, topUpToCents, invalidateSummary]);

    return (
        <div className="flex flex-col h-full w-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <div className="relative w-full px-6 md:px-10 py-12">
                <CrossLineBackground />
                <div className="relative max-w-4xl w-full mx-auto flex flex-col gap-10">
                {/* ---------- Hero / balance ---------- */}
                <div className="flex flex-col items-center text-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-base bg-surface text-[11px] font-semibold text-sec uppercase tracking-wide">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                        Billing
                    </div>
                    <h1 className={`${serif.className} text-4xl md:text-5xl text-pri tracking-tight`}>
                        Pay for what you <span className="text-blue-500 italic">build</span>
                    </h1>
                    <p className="text-[13.5px] text-mut max-w-md">
                        1 generation, unlimited iterations. Every decision cited to real research — no subscriptions, no wasted seats.
                    </p>

                    <div className="mt-3 flex items-baseline gap-2 px-6 py-4 rounded-3xl border border-base bg-surface shadow-sm">
                        <span className="font-mono text-4xl font-bold text-pri tabular-nums">{summary?.balance ?? 0}</span>
                        <span className="text-[13px] text-mut font-medium">credits available</span>
                    </div>
                </div>

                <section className="flex flex-col gap-5">
                    {/* <div className="text-center">
                        <h2 className="text-[15px] font-bold text-pri">Buy credits</h2>
                        <p className="text-[12.5px] text-mut mt-0.5">The more you buy, the further each dollar goes.</p>
                    </div> */}

                    {checkoutSecret ? (
                        <div className="p-5 rounded-3xl border border-base bg-surface shadow-sm max-w-md w-full mx-auto">
                            <Elements
                                stripe={stripePromise}
                                options={{ clientSecret: checkoutSecret, appearance: { theme: "stripe" } }}
                            >
                                <p className="text-[12.5px] text-sec mb-3">
                                    Paying {formatDollars(amountCents)} for{" "}
                                    <span className="font-semibold text-pri">{checkoutCredits} credits</span>
                                </p>
                                <CheckoutForm
                                    onSuccess={handleCheckoutSuccess}
                                    onCancel={() => setCheckoutSecret(null)}
                                />
                            </Elements>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {PACK_TIERS.map((tier) => {
                                    const isSelected = !customAmount && selectedAmount === tier.amountCents;
                                    return (
                                        <button
                                            key={tier.amountCents}
                                            type="button"
                                            onClick={() => {
                                                setSelectedAmount(tier.amountCents);
                                                setCustomAmount("");
                                            }}
                                            className={`relative flex flex-col text-left rounded-3xl border overflow-hidden transition-all cursor-pointer ${
                                                isSelected
                                                    ? "border-blue-400 shadow-lg ring-2 ring-blue-100 dark:ring-blue-900/40"
                                                    : "border-base shadow-sm hover:border-em"
                                            }`}
                                        >
                                            {tier.featured && (
                                                <span className="absolute top-3 right-3 z-10 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide text-white bg-white/20 backdrop-blur-sm border border-white/30">
                                                    Most popular
                                                </span>
                                            )}
                                            <div className={`relative px-4 pt-4 pb-5 bg-gradient-to-br overflow-hidden ${tier.gradient}`}>
                                                <div
                                                    className="absolute inset-0"
                                                    style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.08) 35%, transparent 60%)" }}
                                                />
                                                <div
                                                    className="absolute inset-0 opacity-[0.5] mix-blend-overlay"
                                                    style={{
                                                        backgroundImage:
                                                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.6 0.75 0.85 0.95 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                                                        backgroundSize: "60px 60px",
                                                    }}
                                                />
                                                <p className="relative text-white text-[15px] font-bold">{tier.name}</p>
                                                <p className="relative text-white/80 text-[11px] mt-0.5">{tier.tagline}</p>
                                            </div>
                                            <div className="flex-1 flex flex-col gap-3 px-4 py-4 bg-surface">
                                                <div>
                                                    <span className={`font-mono text-2xl font-bold tabular-nums ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-pri"}`}>
                                                        {formatDollars(tier.amountCents)}
                                                    </span>
                                                    <p className="text-[11.5px] text-mut font-medium mt-0.5">
                                                        {tier.credits} credits · {tier.rate}
                                                    </p>
                                                </div>
                                                <div
                                                    className={`w-full text-center py-2 rounded-xl text-[12px] font-semibold transition-all ${
                                                        isSelected
                                                            ? "bg-blue-500 text-white"
                                                            : "bg-tertiary text-sec"
                                                    }`}
                                                >
                                                    {isSelected ? "Selected" : "Select"}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex items-center gap-2.5 max-w-sm w-full mx-auto">
                                <div className="h-px flex-1 bg-base" />
                                <span className="text-[11px] text-mut font-medium uppercase tracking-wide">or custom amount</span>
                                <div className="h-px flex-1 bg-base" />
                            </div>

                            <div className="flex flex-col gap-2 max-w-sm w-full mx-auto">
                                <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-base bg-surface focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                    <span className="text-[13.5px] text-mut font-medium">$</span>
                                    <input
                                        type="number"
                                        min={5}
                                        step={1}
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="Custom amount, min $5"
                                        className="flex-1 bg-transparent text-[13.5px] text-sec placeholder:text-mut outline-none"
                                    />
                                    {customAmount && (
                                        <span className="text-[12px] font-semibold text-blue-500 whitespace-nowrap">
                                            = {liveCredits} credits
                                        </span>
                                    )}
                                </div>

                                {checkoutError && <p className="text-[12.5px] text-red-500 text-center">{checkoutError}</p>}

                                <button
                                    type="button"
                                    onClick={handleStartCheckout}
                                    disabled={amountCents < 500 || startingCheckout}
                                    className="px-5 py-3 rounded-2xl text-[13px] font-semibold text-white bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                >
                                    {startingCheckout ? "Starting…" : `Continue — ${formatDollars(amountCents)} for ${liveCredits} credits`}
                                </button>
                            </div>
                        </>
                    )}
                </section>

                {/* ---------- What credits cover ---------- */}
                <section className="flex flex-col gap-4">
                    <div className="text-center">
                        <h2 className="text-[15px] font-bold text-pri">What credits cover</h2>
                        <p className="text-[12.5px] text-mut mt-0.5">Every step is cited to real research — no LLM guesswork.</p>
                    </div>

                    <div className="rounded-3xl border border-base bg-surface overflow-hidden shadow-sm">
                        {[
                            { label: "Research", detail: "Evidence-backed design brief, citations included", cost: 2 },
                            { label: "Full generation", detail: "Structure, copy, and design system from the brief", cost: 5 },
                            { label: "Iteration", detail: "Minor edit · major edit costs 2", cost: 1 },
                            { label: "SEO pass", detail: "Sitemap, robots.txt, metadata", cost: 1 },
                            { label: "Deploy", detail: "Live on Vercel with a real build", cost: 1 },
                        ].map((row, i, arr) => (
                            <div
                                key={row.label}
                                className={`flex items-center justify-between gap-4 px-5 py-3.5 ${i < arr.length - 1 ? "border-b border-base" : ""}`}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 shrink-0">
                                        <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-medium text-pri">{row.label}</p>
                                        <p className="text-[11.5px] text-mut truncate">{row.detail}</p>
                                    </div>
                                </div>
                                <span className="font-mono text-[13px] font-bold text-pri tabular-nums shrink-0">
                                    {row.cost} <span className="text-[11px] font-medium text-mut">credit{row.cost > 1 ? "s" : ""}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ---------- Auto-reload ---------- */}
                <section className="flex flex-col gap-4 p-5 rounded-3xl border border-base bg-surface shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                                    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                                    <path d="M21 3v6h-6" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-[14px] font-bold text-pri">Auto-reload</h2>
                                <p className="text-[11.5px] text-mut">Off by default — never lose momentum mid-iteration.</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={autoReloadEnabled}
                            onClick={() => handleToggleAutoReload(!autoReloadEnabled)}
                            disabled={autoReloadSaving}
                            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 shrink-0 ${
                                autoReloadEnabled ? "bg-blue-500" : "bg-tertiary border border-base"
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                                    autoReloadEnabled ? "translate-x-4.5 left-0.5" : "left-0.5"
                                }`}
                            />
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-sec pl-12">
                        <span>When balance drops to</span>
                        <select
                            value={thresholdCents}
                            onChange={(e) => setThresholdCents(Number(e.target.value))}
                            className="px-3 py-1.5 rounded-lg border border-base bg-tertiary text-[12.5px] text-sec outline-none cursor-pointer"
                        >
                            {THRESHOLD_OPTIONS_CENTS.map((cents) => (
                                <option key={cents} value={cents}>
                                    {formatDollars(cents)}
                                </option>
                            ))}
                        </select>
                        <span>top up to</span>
                        <select
                            value={topUpToCents}
                            onChange={(e) => setTopUpToCents(Number(e.target.value))}
                            className="px-3 py-1.5 rounded-lg border border-base bg-tertiary text-[12.5px] text-sec outline-none cursor-pointer"
                        >
                            {TOPUP_OPTIONS_CENTS.map((cents) => (
                                <option key={cents} value={cents}>
                                    {formatDollars(cents)}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleSaveAutoReloadSettings}
                            disabled={autoReloadSaving}
                            className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-all cursor-pointer disabled:opacity-50"
                        >
                            {autoReloadSaving ? "Saving…" : "Save"}
                        </button>
                    </div>

                    {autoReloadError && <p className="text-[12.5px] text-red-500 pl-12">{autoReloadError}</p>}

                    <div className="pl-12">
                        {addCardSecret ? (
                            <div className="p-4 rounded-2xl border border-base bg-tertiary max-w-sm">
                                <Elements
                                    stripe={stripePromise}
                                    options={{ clientSecret: addCardSecret, appearance: { theme: "stripe" } }}
                                >
                                    <AddCardForm
                                        onSuccess={handleAddCardSuccess}
                                        onCancel={() => setAddCardSecret(null)}
                                    />
                                </Elements>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={handleStartAddCard}
                                disabled={startingAddCard}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer disabled:opacity-50 w-fit"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                    <rect x="2" y="5" width="20" height="14" rx="2" />
                                    <line x1="2" y1="10" x2="22" y2="10" />
                                </svg>
                                {startingAddCard ? "Loading…" : "Add / replace card"}
                            </button>
                        )}
                        {addCardError && <p className="text-[12.5px] text-red-500 mt-2">{addCardError}</p>}
                    </div>
                </section>

                <p className="relative text-center text-[11.5px] text-mut">
                    Credits never expire. Cancel auto-reload anytime — no subscription lock-in.
                </p>
                </div>
            </div>
        </div>
    );
}
