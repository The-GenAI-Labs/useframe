"use client";

import { memo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, FileSearch, Globe } from "lucide-react";
import { serif } from "../fonts";

const ITEMS = [
  {
    id: "competitor",
    icon: BarChart3,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-500",
    accentRgb: "234,88,12",
    tag: "Market Intelligence",
    title: "Competitor Analysis",
    description:
      "Benchmark any competitor's positioning, pricing and funnel in one click. Understand gaps, opportunities and what makes them win — before you even write a line of code.",
    stats: [
      { label: "Competitors tracked", value: "200+" },
      { label: "Data points per scan", value: "50+" },
      { label: "Time to insight", value: "< 60s" },
    ],
    cardLines: [
      { label: "Positioning", pct: 88 },
      { label: "Pricing", pct: 72 },
      { label: "Funnel", pct: 91 },
      { label: "Keywords", pct: 65 },
      { label: "Traffic", pct: 80 },
    ],
  },
  {
    id: "scoring",
    icon: Globe,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    accentRgb: "22,163,74",
    tag: "Performance Audit",
    title: "Website Scoring",
    description:
      "Audit performance, UX and conversion signals with an AI web score. Get a prioritised fix list with estimated revenue impact for every issue we find.",
    stats: [
      { label: "Signals analysed", value: "120+" },
      { label: "Avg score lift", value: "+34pts" },
      { label: "Audit time", value: "< 30s" },
    ],
    cardLines: [
      { label: "Performance", pct: 88 },
      { label: "UX Score", pct: 74 },
      { label: "Accessibility", pct: 92 },
      { label: "SEO", pct: 67 },
      { label: "CRO", pct: 78 },
    ],
  },
  {
    id: "research",
    icon: FileSearch,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    accentRgb: "37,99,235",
    tag: "Deep Research",
    title: "Long-form Research",
    description:
      "Long-form market and audience research, summarised into action items. UseFrame reads hundreds of sources and hands you a structured brief you can ship from.",
    stats: [
      { label: "Sources synthesised", value: "500+" },
      { label: "Brief length", value: "~2 pages" },
      { label: "Research time", value: "< 2 min" },
    ],
    cardLines: [
      { label: "Market size", pct: 82 },
      { label: "Audience", pct: 76 },
      { label: "Trends", pct: 90 },
      { label: "Pain points", pct: 68 },
      { label: "Channels", pct: 85 },
    ],
  },
];

const E = [0.22, 1, 0.36, 1] as const;

export const ResearchSection = memo(function ResearchSection() {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((i: number) => {
    setActive(i);
    const track = trackRef.current;
    if (!track) return;
    const slide = track.children[i] as HTMLElement;
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft, behavior: "smooth" });
    }
  }, []);

  return (
    <section id="research" className="relative z-10 w-full scroll-mt-24 overflow-hidden py-14">

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2"
        style={{
          maskImage: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6">

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto max-w-2xl text-center"
        >
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
            Research
          </span>
          <h2 className={`${serif.className} mt-4 text-4xl tracking-tight text-slate-950 sm:text-5xl`}>
            Know the market before you build
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            UseFrame turns scattered signals into clear, structured research you can act on.
          </p>
        </motion.div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {ITEMS.map((it, i) => {
            const Icon = it.icon;
            const isActive = active === i;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => goTo(i)}
                className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-semibold transition-all duration-200 ${
                  isActive
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800"
                }`}
              >
                <Icon className={`size-3.5 ${isActive ? "text-white" : it.iconColor}`} />
                {it.title}
              </button>
            );
          })}
        </div>

      </div>

      <div
        ref={trackRef}
        className="mt-8 flex snap-x snap-mandatory overflow-x-auto scroll-smooth pb-2"
        style={{ scrollbarWidth: "none" }}
      >
        {ITEMS.map((item, i) => {
          const isActive = active === i;
          return (
            <div
              key={item.id}
              className="w-full shrink-0 snap-center px-4 sm:px-6"
            >
              <div className="mx-auto max-w-6xl">
                <AnimatePresence mode="wait" initial={false}>
                  {isActive && (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.42, ease: E }}
                      className="flex flex-col gap-4 lg:flex-row lg:gap-3"
                    >
                      <div className="flex flex-col justify-between rounded-4xl border border-slate-100 bg-white p-8 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.07)] lg:w-[44%]">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${item.iconBg}`}>
                              <item.icon className={`size-5 ${item.iconColor}`} />
                            </span>
                            <span
                              className="text-xs font-semibold uppercase tracking-[0.18em]"
                              style={{ color: `rgb(${item.accentRgb})` }}
                            >
                              {item.tag}
                            </span>
                          </div>

                          <h3 className={`${serif.className} mt-5 text-3xl leading-[1.08] tracking-tight text-slate-950 sm:text-4xl`}>
                            {item.title}
                          </h3>

                          <p className="mt-4 text-sm leading-relaxed text-slate-500">
                            {item.description}
                          </p>
                        </div>

                        <div className="mt-8 grid grid-cols-3 gap-3 border-t border-slate-100 pt-6">
                          {item.stats.map((s) => (
                            <div key={s.label}>
                              <p
                                className="text-xl font-extrabold tracking-tight"
                                style={{ color: `rgb(${item.accentRgb})` }}
                              >
                                {s.value}
                              </p>
                              <p className="mt-0.5 text-[10px] leading-tight text-slate-400">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          className="mt-6 inline-flex w-full cursor-pointer items-center justify-center rounded-2xl py-3 text-[13px] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
                          style={{
                            backgroundColor: `rgb(${item.accentRgb})`,
                            boxShadow: `0 4px 18px rgba(${item.accentRgb},0.35)`,
                          }}
                        >
                          Try {item.title} →
                        </button>
                      </div>

                      <div
                        className="flex flex-1 flex-col overflow-hidden rounded-4xl px-5 pb-5 pt-4"
                        style={{ backgroundColor: `rgba(${item.accentRgb},0.09)` }}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p
                              className="text-[9px] font-semibold uppercase tracking-[0.2em]"
                              style={{ color: `rgb(${item.accentRgb})` }}
                            >
                              UseFrame AI
                            </p>
                            <p className="mt-0.5 text-[1.2rem] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#0E0E0E]">
                              {item.title}
                            </p>
                          </div>
                          <div
                            className="flex items-center gap-1.5 rounded-full border bg-white/60 px-2.5 py-1 text-[10px] font-medium backdrop-blur-sm"
                            style={{
                              borderColor: `rgba(${item.accentRgb},0.25)`,
                              color: `rgb(${item.accentRgb})`,
                            }}
                          >
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: `rgb(${item.accentRgb})` }}
                            />
                            Live
                          </div>
                        </div>

                        <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl bg-[#0E0E0E] p-5 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.4)]">
                          <div className="mb-4 flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-white/10" />
                            <span className="size-2 rounded-full bg-white/10" />
                            <span className="size-2 rounded-full bg-white/10" />
                            <span className="ml-auto text-[9px] font-semibold uppercase tracking-widest text-white/30">
                              Analysis
                            </span>
                          </div>

                          <div className="space-y-3">
                            {item.cardLines.map((row, j) => (
                              <motion.div
                                key={row.label}
                                initial={{ opacity: 0, x: 12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: j * 0.05, duration: 0.28, ease: "easeOut" }}
                                className="flex items-center gap-3"
                              >
                                <span className="w-24 shrink-0 text-[11px] font-medium text-white/60">
                                  {row.label}
                                </span>
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${row.pct}%`,
                                      backgroundColor: `rgba(${item.accentRgb},0.9)`,
                                    }}
                                  />
                                </div>
                                <span className="w-7 text-right text-[11px] font-bold text-white">
                                  {row.pct}
                                </span>
                              </motion.div>
                            ))}
                          </div>

                          <div className="mt-5 flex items-end justify-between">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                                AI Score
                              </p>
                              <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-white">
                                {item.stats[0].value}
                                <span className="ml-1 text-sm font-medium text-white/30">
                                  {item.stats[0].label}
                                </span>
                              </p>
                            </div>
                            <div
                              className="rounded-xl px-3 py-1.5 text-[11px] font-bold"
                              style={{
                                backgroundColor: `rgba(${item.accentRgb},0.18)`,
                                color: `rgb(${item.accentRgb})`,
                              }}
                            >
                              View report →
                            </div>
                          </div>

                          <div className="flex-1" />
                          <p className="mt-4 text-right text-[9px] font-semibold uppercase tracking-[0.22em] text-white/20">
                            {item.title}
                          </p>
                        </div>
                      </div>

                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        {ITEMS.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`cursor-pointer rounded-full transition-all duration-300 ${
              active === i ? "h-2 w-8 bg-slate-900" : "size-2 bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>

    </section>
  );
});
