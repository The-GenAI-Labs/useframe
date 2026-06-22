"use client";

import { memo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { motion, useScroll, useSpring, useTransform, AnimatePresence } from "framer-motion";
import { serif } from "../fonts";
import { FEATURES } from "./cta/features";

export const CtaSection = memo(function CtaSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const rightRef   = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const rawCard = useTransform(scrollYProgress, [0, 1], [130, -130]);
  const cardY   = useSpring(rawCard, { stiffness: 18, damping: 14, mass: 1.2 });

  const { scrollYProgress: rightP } = useScroll({ target: rightRef, offset: ["start end", "end start"] });
  const rawRight = useTransform(rightP, [0, 1], [70, -70]);
  const rightY   = useSpring(rawRight, { stiffness: 14, damping: 12, mass: 1.5 });

  const feat = FEATURES[active];
  const handleEnter = useCallback((i: number) => setActive(i), []);

  return (
    <section ref={sectionRef} id="cta" className="relative w-full scroll-mt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[62%] overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 28%, rgba(0,0,0,0.25) 58%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 28%, rgba(0,0,0,0.25) 58%, transparent 100%)",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
              "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2"
        style={{
          maskImage: "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.18) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.18) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-5 py-8 sm:px-8 lg:grid-cols-[380px_540px] lg:gap-16 lg:py-10 xl:grid-cols-[400px_580px] lg:justify-center">
        <div className="flex flex-col justify-center">
          <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-500">
            Everything you need
          </p>
          <h2 className={`${serif.className} mb-12 text-[2.75rem] leading-[1.04] tracking-[-0.022em] text-slate-950 sm:text-5xl lg:text-[3rem]`}>
            One Tool. Every Layer.
          </h2>

          <div className="flex flex-col">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              const isActive = active === i;
              return (
                <button
                  key={f.id}
                  type="button"
                  onMouseEnter={() => handleEnter(i)}
                  onClick={() => handleEnter(i)}
                  className={`group relative flex cursor-pointer items-center gap-4 border-b py-4 text-left last:border-0 transition-colors duration-200 ${
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
                  <span
                    className="w-7 shrink-0 font-mono text-[11px] tabular-nums transition-colors duration-200"
                    style={{ color: isActive ? `rgb(${f.accentRgb})` : "rgb(203,213,225)" }}
                  >
                    {f.number}
                  </span>
                  <Icon
                    className="size-4 shrink-0 transition-colors duration-200"
                    style={{ color: isActive ? "rgb(71,85,105)" : "rgb(203,213,225)" }}
                  />
                  <span
                    className="whitespace-nowrap text-[15px] font-medium tracking-tight transition-colors duration-200"
                    style={{ color: isActive ? "rgb(2,6,23)" : "rgb(148,163,184)" }}
                  >
                    {f.label}
                  </span>
                  <div className="ml-auto flex w-[168px] shrink-0 items-center justify-end gap-2">
                    {isActive ? (
                      <div className="flex items-center gap-1.5">
                        <Link
                          href="/research"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          <BookOpen className="size-3 text-slate-400" />
                          Research
                        </Link>
                        <Link
                          href="/signin"
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white"
                          style={{
                            background: `linear-gradient(135deg, rgb(${f.accentRgb}), rgba(${f.accentRgb},0.65))`,
                          }}
                        >
                          Start
                          <ArrowRight className="size-3" />
                        </Link>
                      </div>
                    ) : (
                      <div className="invisible flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-[11px]">
                          Research
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px]">
                          Start
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <motion.div ref={rightRef} style={{ y: cardY }} className="relative">
          <div
            className="relative overflow-hidden rounded-[2rem] border-[10px] border-white shadow-[0_28px_80px_-20px_rgba(37,99,235,0.55),0_0_0_1px_rgba(37,99,235,0.15)]"
            style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 40%, #1e40af 75%, #1e3a8a 100%)" }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-[1.4rem]"
              style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 100%)" }}
            />
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.28]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <filter id="ctaGrain" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.72 0.68" numOctaves="4" seed="5" stitchTiles="stitch" result="noise" />
                <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
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
                style={{ background: `radial-gradient(circle, rgba(${feat.accentRgb},0.13) 0%, transparent 70%)` }}
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
                    style={{ background: `linear-gradient(135deg, rgb(${feat.accentRgb}), rgba(${feat.accentRgb},0.6))` }}
                  >
                    {feat.tag}
                  </span>
                  <h3 className={`${serif.className} mt-5 whitespace-nowrap text-[1.75rem] leading-[1.08] tracking-[-0.018em] text-white sm:text-[2rem]`}>
                    {feat.headline}
                  </h3>
                  <p className="mt-3 text-[13px] leading-[1.72] tracking-[0.004em] text-blue-100">
                    {feat.description}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={feat.id + "-img"}
                  initial={{ opacity: 0, y: 18, scale: 0.978 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.978 }}
                  transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                  className="relative overflow-hidden rounded-xl border border-slate-100/80 shadow-[0_6px_28px_-6px_rgba(0,0,0,0.09)]"
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
                    <svg className="absolute left-2.5 top-2.5" width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M0 9 L0 0 L9 0" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    </svg>
                    <svg className="absolute right-2.5 top-2.5" width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M18 9 L18 0 L9 0" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    </svg>
                    <svg className="absolute bottom-2.5 left-2.5" width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M0 9 L0 18 L9 18" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    </svg>
                    <svg className="absolute bottom-2.5 right-2.5" width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M18 9 L18 18 L9 18" stroke="rgba(148,163,184,0.45)" strokeWidth="1" />
                    </svg>
                  </div>
                  <img src={feat.image} alt={feat.label} className="aspect-[16/9] w-full object-cover" />
                  <div
                    className="absolute inset-x-0 bottom-0 h-1/3"
                    style={{ background: `linear-gradient(to top, rgba(${feat.accentRgb},0.07), transparent)` }}
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
});
