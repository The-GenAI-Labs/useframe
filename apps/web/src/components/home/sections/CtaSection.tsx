"use client";

import { memo, useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import {
  motion,
  useScroll,
  useReducedMotion,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { landingFont as serif } from "../fonts";
import { FEATURES } from "./cta/features";
import { FeatureScene } from "./cta/FeatureScene";

export const CtaSection = memo(function CtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const isMobile = useIsMobile();
  const prefersReducedMotion = useReducedMotion();
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(prefersReducedMotion ?? false);
  }, [prefersReducedMotion]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const cardOffset = reducedMotion ? 0 : isMobile ? 28 : 130;
  const rawCard = useTransform(
    scrollYProgress,
    [0, 1],
    [cardOffset, -cardOffset],
  );
  const cardY = useSpring(rawCard, { stiffness: 18, damping: 14, mass: 1.2 });

  const feat = FEATURES[active];
  const handleEnter = useCallback((i: number) => setActive(i), []);

  return (
    <section ref={sectionRef} id="cta" className="relative w-full scroll-mt-24">
      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-5 py-8 sm:px-8 lg:grid-cols-[380px_540px] lg:gap-16 lg:py-10 xl:grid-cols-[400px_580px] lg:justify-center">
        <div className="flex flex-col justify-center">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-500">
            Everything you need
          </p>
          <h2
            className={`${serif.className} mb-12 text-[2.75rem] leading-[1.04] tracking-[-0.022em] text-slate-950 sm:text-5xl lg:text-[3rem]`}
          >
            From idea to launch.
          </h2>

          <div className="flex flex-col">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const isActive = active === i;
              return (
                <div
                  key={f.id}
                  className={`group relative flex flex-wrap items-center gap-4 border-b py-4 text-left last:border-0 transition-colors duration-200 min-[380px]:flex-nowrap ${
                    isActive ? "border-slate-200" : "border-slate-100/80"
                  }`}
                >
                  <span
                    className="absolute left-0 top-1/2 w-[2px] -translate-y-1/2 rounded-full transition-opacity duration-200"
                    style={{
                      background: `linear-gradient(to bottom, rgb(${f.accentRgb}), rgba(${f.accentRgb},0.3))`,
                      height: "22px",
                      opacity: isActive ? 1 : 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleEnter(i)}
                    className="flex min-h-12 min-w-0 cursor-pointer items-center gap-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
                  >
                    <span
                      className="w-7 shrink-0 font-mono text-[11px] tabular-nums transition-colors duration-200"
                      style={{
                        color: isActive
                          ? `rgb(${f.accentRgb})`
                          : "rgb(203,213,225)",
                      }}
                    >
                      {f.number}
                    </span>
                    <Icon
                      className="size-4 shrink-0 transition-colors duration-200"
                      style={{
                        color: isActive ? "rgb(71,85,105)" : "rgb(203,213,225)",
                      }}
                    />
                    <span
                      className="text-[15px] font-medium tracking-tight transition-colors duration-200 min-[380px]:whitespace-nowrap"
                      style={{
                        color: isActive ? "rgb(2,6,23)" : "rgb(148,163,184)",
                      }}
                    >
                      {f.label}
                    </span>
                  </button>
                  <div
                    className={`${isActive ? "flex" : "hidden min-[380px]:flex"} basis-full items-center justify-start gap-2 pl-11 min-[380px]:ml-auto min-[380px]:w-[104px] min-[380px]:basis-auto min-[380px]:justify-end min-[380px]:pl-0`}
                  >
                    {isActive ? (
                      <div className="flex items-center gap-1.5">
                        <Link
                          href="/research"
                          className="inline-flex min-h-12 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-600 min-[380px]:px-2.5"
                        >
                          <BookOpen className="size-3 text-slate-400" />
                          Research
                        </Link>
                      </div>
                    ) : (
                      <div className="invisible flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-[11px]">
                          Research
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <motion.div ref={rightRef} style={{ y: cardY }} className="relative">
          <div
            className="relative overflow-hidden rounded-[2rem] border-[10px] border-white shadow-[0_28px_80px_-20px_rgba(37,99,235,0.55)]"
            style={{
              background:
                "linear-gradient(160deg, #ffffff 0%, #eaf1ff 26%, #a8c4f8 60%, #3f7bec 100%)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[1.4rem]"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 100%)",
              }}
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.26] mix-blend-multiply"
              style={{
                maskImage:
                  "linear-gradient(160deg, rgb(0 0 0 / 8%) 0%, rgb(0 0 0 / 35%) 45%, #000 100%)",
                WebkitMaskImage:
                  "linear-gradient(160deg, rgb(0 0 0 / 8%) 0%, rgb(0 0 0 / 35%) 45%, #000 100%)",
              }}
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter
                id="ctaGrain"
                x="-5%"
                y="-5%"
                width="110%"
                height="110%"
                colorInterpolationFilters="sRGB"
              >
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.72 0.68"
                  numOctaves="4"
                  seed="5"
                  stitchTiles="stitch"
                  result="noise"
                />
                <feColorMatrix
                  type="saturate"
                  values="0"
                  in="noise"
                  result="grayNoise"
                />
                <feComponentTransfer in="grayNoise" result="contrastNoise">
                  <feFuncR type="linear" slope="4" intercept="-1.5" />
                  <feFuncG type="linear" slope="4" intercept="-1.5" />
                  <feFuncB type="linear" slope="4" intercept="-1.5" />
                </feComponentTransfer>
              </filter>
              <rect width="100%" height="100%" filter="url(#ctaGrain)" />
            </svg>

            <AnimatePresence mode="wait">
              <motion.div
                key={feat.id + "-blob"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full blur-3xl"
                style={{
                  background: `radial-gradient(circle, rgba(${feat.accentRgb},0.13) 0%, transparent 70%)`,
                }}
              />
            </AnimatePresence>

            <div className="relative z-10 px-8 pb-5 pt-9 sm:px-10 sm:pt-11">
              <AnimatePresence mode="wait">
                <motion.div
                  key={feat.id + "-text"}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -9 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                >
                  <span
                    className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white"
                    style={{
                      background:
                        "linear-gradient(135deg, rgb(37,99,235), rgba(37,99,235,0.6))",
                    }}
                  >
                    {feat.tag}
                  </span>
                  <h3
                    className={`${serif.className} mt-5 text-[1.75rem] leading-[1.08] tracking-[-0.018em] text-slate-950 sm:whitespace-nowrap sm:text-[2rem]`}
                  >
                    {feat.headline}
                  </h3>
                  <p className="mt-3 text-[13px] leading-[1.72] tracking-[0.004em] text-slate-600">
                    {feat.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative z-10 px-5 pb-[72px] sm:px-6 sm:pb-[72px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={feat.id + "-img"}
                  initial={{ opacity: 0, y: 18, scale: 0.978 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.978 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className="relative"
                >
                  <FeatureScene
                    id={feat.id}
                    accentRgb={feat.accentRgb}
                    reduced={reducedMotion}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <svg
            aria-hidden
            width="134"
            height="130"
            viewBox="0 0 134 130"
            className="pointer-events-none absolute bottom-0 left-0 z-20"
          >
            <path
              d="M0 0H10V6A22 22 0 0 0 32 28H84A22 22 0 0 1 106 50V98A22 22 0 0 0 128 120H134V130H32A32 32 0 0 1 0 98Z"
              fill="#fff"
            />
          </svg>
          <Link
            href="/signin"
            aria-label={`Start with ${feat.label}`}
            className="absolute bottom-[26px] left-[26px] z-30 flex size-14 items-center justify-center rounded-full text-white transition-transform duration-200 hover:-translate-y-0.5 hover:translate-x-0.5"
            style={{
              background: "linear-gradient(135deg, #2563eb, #60a5fa)",
            }}
          >
            <ArrowUpRight className="size-6" aria-hidden />
          </Link>
        </motion.div>
      </div>
    </section>
  );
});
