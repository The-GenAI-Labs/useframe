"use client";

import { memo, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, Lock, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { serif } from "@/components/home/fonts";

export type ShowcaseTab = "RESEARCH" | "WEBSITE" | "SEO" | "DEPLOY";

export const SHOWCASE_PANEL_ID = "home-showcase-panel";

const PUBLISHING_ENABLED = process.env.NEXT_PUBLIC_PUBLISHING_ENABLED === "true";

// The visuals are laid out at this size and scaled to the card's width.
const STAGE_WIDTH = 536;
const STAGE_HEIGHT = 246;

const panel = "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

function ExampleBadge({ className = "" }: { className?: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${className}`}
        >
            Example
        </span>
    );
}

const FINDINGS = [
    { text: "55–70 characters per line read fastest", cite: "Dyson & Haselgrove, 2001" },
    { text: "Dark text on light backgrounds reads faster", cite: "Piepenbrock et al., 2013" },
    { text: "Larger body text helps older readers", cite: "Bernard et al., 2001" },
];

const PALETTE = ["#1E3A8A", "#3B82F6", "#DBEAFE", "#F8FAFC", "#F97316"];

function ResearchVisual() {
    return (
        <div className="flex h-full gap-3 p-4">
            <div className="flex w-[58%] flex-col gap-1.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Research brief</p>
                <p className="mb-0.5 text-[15px] font-semibold text-slate-900">Boutique fitness studio</p>
                {FINDINGS.map((finding) => (
                    <div key={finding.cite} className={`${panel} px-3 py-1.5`}>
                        <p className="text-[12px] font-medium leading-snug text-slate-800">{finding.text}</p>
                        <p className="text-[10.5px] text-slate-500">{finding.cite}</p>
                    </div>
                ))}
            </div>
            <div className="flex flex-1 flex-col gap-2">
                <ExampleBadge className="self-end" />
                <div className={`${panel} p-3`}>
                    <p className="text-[11px] font-semibold text-slate-700">Colour palette</p>
                    <div
                        role="img"
                        aria-label="Navy, blue, pale blue, off-white and an orange accent"
                        className="mt-2 flex gap-1.5"
                    >
                        {PALETTE.map((color) => (
                            <span
                                key={color}
                                className="h-6 flex-1 rounded-md border border-slate-900/10"
                                style={{ backgroundColor: color }}
                            />
                        ))}
                    </div>
                    <p className="mt-2 text-[10.5px] leading-snug text-slate-600">
                        Calm blues build trust; one warm accent for actions.
                    </p>
                </div>
                <div className={`${panel} flex items-center gap-2 px-3 py-2.5`}>
                    <div className="flex -space-x-1" aria-hidden="true">
                        {["bg-slate-200", "bg-slate-300", "bg-slate-200"].map((tone, i) => (
                            <span key={i} className={`h-4 w-4 rounded-full border-2 border-white ${tone}`} />
                        ))}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-700">3 competitors analysed</p>
                </div>
            </div>
        </div>
    );
}

function WebsiteVisual() {
    return (
        <div className="h-full p-3">
            <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-slate-100 px-3">
                    <div className="flex gap-1" aria-hidden="true">
                        <span className="h-2 w-2 rounded-full bg-slate-200" />
                        <span className="h-2 w-2 rounded-full bg-slate-200" />
                        <span className="h-2 w-2 rounded-full bg-slate-200" />
                    </div>
                    <div className="mx-auto flex h-5 w-[44%] items-center justify-center gap-1 rounded-md bg-slate-100 text-[10px] text-slate-600">
                        <Lock className="size-2.5" aria-hidden="true" />
                        preview
                    </div>
                    <div className="flex items-center rounded-md bg-slate-100 p-0.5 text-slate-500" aria-hidden="true">
                        <span className="rounded bg-white p-1 text-slate-800 shadow-sm">
                            <Monitor className="size-3" />
                        </span>
                        <span className="p-1">
                            <Smartphone className="size-3" />
                        </span>
                    </div>
                    <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">v3</span>
                </div>
                <div className="relative flex-1 bg-slate-50">
                    <Image
                        src="/auth/login17.png"
                        alt="Example generated website: a landing page for a wind-turbine inspection product"
                        fill
                        loading="eager"
                        sizes="(max-width: 640px) 92vw, 536px"
                        className="object-cover object-top"
                    />
                    <ExampleBadge className="absolute bottom-2 right-2 shadow-sm" />
                </div>
            </div>
        </div>
    );
}

const SEO_CHECKS: { label: string; ok: boolean; note: string }[] = [
    { label: "Title & meta description", ok: true, note: "Pass" },
    { label: "Heading structure", ok: true, note: "Pass" },
    { label: "Image alt text", ok: false, note: "2 missing" },
    { label: "Core Web Vitals", ok: true, note: "Pass" },
];

function ScoreRing({ score }: { score: number }) {
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    return (
        <div className="relative h-[88px] w-[88px]">
            <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="44" cy="44" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="8" />
                <circle
                    cx="44"
                    cy="44"
                    r={radius}
                    fill="none"
                    stroke="url(#seo-score)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - score / 100)}
                />
                <defs>
                    <linearGradient id="seo-score" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#4F46E5" />
                        <stop offset="100%" stopColor="#7C3AED" />
                    </linearGradient>
                </defs>
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[26px] font-semibold text-slate-900">
                {score}
            </span>
        </div>
    );
}

function SeoVisual() {
    return (
        <div className="flex h-full gap-3 p-4">
            <div className={`${panel} flex w-[34%] flex-col items-center justify-center gap-1.5`}>
                <ScoreRing score={92} />
                <p className="text-[11px] font-semibold text-slate-700">SEO score</p>
                <ExampleBadge />
            </div>
            <div className="flex flex-1 flex-col gap-2">
                <ul className={`${panel} flex flex-col gap-1.5 px-3 py-2.5`}>
                    {SEO_CHECKS.map((check) => (
                        <li key={check.label} className="flex items-center gap-2 text-[11.5px] text-slate-800">
                            {check.ok ? (
                                <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                            ) : (
                                <AlertTriangle className="size-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                            )}
                            <span className="flex-1">{check.label}</span>
                            <span className={check.ok ? "text-emerald-700" : "text-amber-700"}>{check.note}</span>
                        </li>
                    ))}
                </ul>
                <div className={`${panel} flex-1 px-3 py-2`}>
                    <p className="text-[10px] text-slate-500">yourproject-abc.useframe.in › classes</p>
                    <p className="text-[13px] leading-snug text-[#1a0dab]">Boutique Fitness Studio · Classes &amp; Pricing</p>
                    <p className="line-clamp-2 text-[10.5px] leading-snug text-slate-600">
                        Small-group strength and yoga classes with flexible passes. Book your first class online.
                    </p>
                </div>
            </div>
        </div>
    );
}

const DEPLOY_STEPS = ["Build", "Upload", "Live"];

function DeployVisual() {
    return (
        <div className="flex h-full flex-col gap-2.5 p-4">
            <div className={`${panel} flex items-center gap-2 px-3 py-2.5`}>
                <Lock className="size-3.5 text-emerald-600" aria-hidden="true" />
                <span className="text-[13px] font-medium text-slate-800">yourproject-abc.useframe.in</span>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    Live
                </span>
            </div>
            <ol className={`${panel} flex items-center gap-2 px-4 py-3`}>
                {DEPLOY_STEPS.map((step, index) => (
                    <li key={step} className="flex flex-1 items-center gap-2 last:flex-none">
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-slate-800">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                            </span>
                            {step}
                        </span>
                        {index < DEPLOY_STEPS.length - 1 && <span className="h-px flex-1 bg-emerald-200" aria-hidden="true" />}
                    </li>
                ))}
            </ol>
            <div className={`${panel} flex items-center gap-3 px-3 py-2.5`}>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                </span>
                <div>
                    <p className="text-[12.5px] font-medium text-slate-800">Connect your domain</p>
                    <p className="text-[10.5px] text-slate-500">SSL certificate included</p>
                </div>
                <span className="ml-auto rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500">
                    www.yourdomain.com
                </span>
            </div>
            <ExampleBadge className="mt-auto self-end" />
        </div>
    );
}

type Showcase = {
    title: string;
    description: string;
    action: string;
    prompt: string;
    available: boolean;
    Visual: () => ReactNode;
};

const SHOWCASES: Record<ShowcaseTab, Showcase> = {
    RESEARCH: {
        title: "Research first",
        description: "Cited findings, a palette and a competitor scan.",
        action: "Start research",
        prompt: "Research a website for my boutique fitness studio: who it is for, what my competitors do, and which colours and type choices the research supports.",
        available: true,
        Visual: ResearchVisual,
    },
    WEBSITE: {
        title: "Build your site",
        description: "A responsive site built from your research.",
        action: "Build a website",
        prompt: "Build a modern, mobile-first website for my boutique fitness studio with a class schedule, pricing and a clear booking call to action.",
        available: true,
        Visual: WebsiteVisual,
    },
    SEO: {
        title: "Check your SEO",
        description: "A score, key fixes and a search preview.",
        action: "Run an SEO check",
        prompt: "Run an SEO check on my website and list the fixes that matter most, starting with titles, headings, image alt text and Core Web Vitals.",
        available: true,
        Visual: SeoVisual,
    },
    DEPLOY: {
        title: "Publish to the web",
        description: "A useframe.in address with SSL and your own domain.",
        action: "Publish my site",
        prompt: "Publish my latest website and help me connect my own domain.",
        available: PUBLISHING_ENABLED,
        Visual: DeployVisual,
    },
};

function useStageScale() {
    const ref = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => setScale(el.clientWidth / STAGE_WIDTH);
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return [ref, scale] as const;
}

const primaryAction =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold sm:h-10 sm:px-4 sm:text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

interface HomeShowcaseProps {
    tab: ShowcaseTab;
    onAction: (prompt: string) => void;
}

export default memo(function HomeShowcase({ tab, onAction }: HomeShowcaseProps) {
    const [stageRef, scale] = useStageScale();
    const reduceMotion = useReducedMotion();
    const showcase = SHOWCASES[tab];
    const { Visual } = showcase;

    const fade = {
        initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: reduceMotion ? 0 : -4 },
        transition: { duration: 0.22, ease: "easeOut" as const },
    };

    return (
        <section
            id={SHOWCASE_PANEL_ID}
            role="tabpanel"
            aria-labelledby={`${SHOWCASE_PANEL_ID}-tab-${tab}`}
            className="mx-auto w-full max-w-[min(560px,92vw)] rounded-3xl border border-white/60 bg-white/80 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.12),0_24px_48px_-16px_rgba(79,70,229,0.18)] backdrop-blur-xl"
        >
            <div
                ref={stageRef}
                className="relative w-full overflow-hidden rounded-2xl border border-slate-900/5 bg-gradient-to-br from-slate-50 via-white to-indigo-50/70"
                style={{ aspectRatio: `${STAGE_WIDTH} / ${STAGE_HEIGHT}` }}
            >
                <AnimatePresence initial={false}>
                    <motion.div
                        key={tab}
                        {...fade}
                        className="absolute left-0 top-0"
                        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, scale, originX: 0, originY: 0 }}
                    >
                        <Visual />
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="relative h-[76px]">
                <AnimatePresence initial={false}>
                    <motion.div key={tab} {...fade} className="absolute inset-0 flex items-center gap-3 px-2 pt-2">
                        <div className="min-w-0 flex-1">
                            <h2 className={`${serif.className} truncate text-[19px] leading-tight text-slate-900 sm:text-[22px]`}>{showcase.title}</h2>
                            <p className="line-clamp-2 text-[12.5px] leading-snug text-slate-600 sm:line-clamp-1">
                                {showcase.description}
                            </p>
                        </div>
                        {showcase.available ? (
                            <button
                                type="button"
                                onClick={() => onAction(showcase.prompt)}
                                className={`${primaryAction} bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm shadow-indigo-600/20 hover:from-indigo-700 hover:to-violet-700`}
                            >
                                {showcase.action}
                                <ArrowRight className="size-3.5" aria-hidden="true" />
                            </button>
                        ) : (
                            <div className="group relative shrink-0">
                                <button
                                    type="button"
                                    aria-disabled="true"
                                    aria-describedby="showcase-coming-soon"
                                    className={`${primaryAction} cursor-not-allowed bg-slate-100 text-slate-600`}
                                >
                                    Coming soon
                                </button>
                                <span
                                    id="showcase-coming-soon"
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-[220px] rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11.5px] leading-snug text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                                >
                                    Publishing isn&apos;t available yet. We&apos;ll switch it on soon.
                                </span>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
});
