"use client";

import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import type { Category } from "./categories";

const E = [0.22, 1, 0.36, 1] as const;
const PATH = `M 70 0 H 830 C 870 0 900 30 900 70 V 500 C 900 550 860 580 800 580 C 700 580 620 620 560 650 H 70 C 30 650 0 620 0 580 V 70 C 0 30 30 0 70 0 Z`;

export const ShowcaseCard = memo(function ShowcaseCard({
  category,
  onPrev,
  onNext,
  reduced,
}: {
  category: Category;
  onPrev: () => void;
  onNext: () => void;
  reduced: boolean;
}) {
  const tx = reduced ? { duration: 0.15 } : { duration: 0.5, ease: E };

  return (
    <div className="relative w-full">
      <svg
        viewBox="0 -10 900 730"
        className="w-full"
        style={{ overflow: "visible", maxHeight: "330px" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="tmplGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#003FCC" />
            <stop offset="45%" stopColor="#0057FF" />
            <stop offset="100%" stopColor="#001A66" />
          </linearGradient>
          <clipPath id="tmplClip">
            <path d={PATH} />
          </clipPath>
          <filter id="tmplShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="20" stdDeviation="20" floodOpacity="0.18" />
          </filter>
        </defs>
        <path d={PATH} fill="url(#tmplGradient)" filter="url(#tmplShadow)" stroke="white" strokeWidth="18" />
        <image
          href={category.src}
          x="0" y="0" width="900" height="650"
          clipPath="url(#tmplClip)"
          preserveAspectRatio="xMidYMin slice"
          style={{ opacity: 0.85 }}
        />
        <defs>
          <linearGradient id="tmplOverlay" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#000a1f" stopOpacity="0.55" />
            <stop offset="40%"  stopColor="#000a1f" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#000a1f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={PATH} fill="url(#tmplOverlay)" clipPath="url(#tmplClip)" />
      </svg>

      <div className="absolute inset-0 flex flex-col justify-end p-6 pb-8">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={category.title}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
            transition={tx}
            className="max-w-xs"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
              {category.badge}
            </span>
            <h3 className="mt-1 text-xl font-extrabold leading-tight tracking-tight text-white">
              {category.title}
            </h3>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="absolute right-6 top-[69%] flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/95 p-1.5 shadow-lg backdrop-blur-sm">
        <button type="button" onClick={onPrev} aria-label="Previous"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 active:scale-95">
          <ArrowLeft className="size-3.5" strokeWidth={2} />
        </button>
        <button type="button" onClick={onNext} aria-label="Next"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-600/30 transition-transform hover:scale-105 active:scale-95">
          <ArrowRight className="size-3.5" strokeWidth={2} />
        </button>
        <button type="button" aria-label="Open"
          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 active:scale-95">
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
});
