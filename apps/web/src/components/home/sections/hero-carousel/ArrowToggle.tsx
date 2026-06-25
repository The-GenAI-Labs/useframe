"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";

export const ArrowToggle = memo(function ArrowToggle({
  onClick,
  reduced,
}: {
  onClick: () => void;
  reduced: boolean;
}) {
  const RING_R = 44;
  const ringPath = `M 56,56 m -${RING_R},0 a ${RING_R},${RING_R} 0 1,1 ${RING_R * 2},0 a ${RING_R},${RING_R} 0 1,1 -${RING_R * 2},0`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Next slide"
      className="group relative flex size-[104px] cursor-pointer items-center justify-center rounded-full border border-slate-200/80 bg-white/90 shadow-[0_4px_24px_-6px_rgba(0,0,0,0.15)] backdrop-blur-sm transition-transform duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 hover:scale-105 active:scale-95"
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={reduced ? {} : { rotate: 360 }}
        transition={reduced ? {} : { duration: 14, repeat: Infinity, ease: "linear" }}
      >
        <svg viewBox="0 0 112 112" className="size-full" aria-hidden>
          <defs>
            <path id="hc-ring" d={ringPath} />
          </defs>
          <text fontSize="7.4" fill="#9aa3b2" letterSpacing="1.9" fontFamily="system-ui,sans-serif" fontWeight="500">
            <textPath href="#hc-ring" startOffset="0%">
              {"Learn more • Learn more • Learn more • "}
            </textPath>
          </text>
        </svg>
      </motion.div>
      <motion.div
        whileTap={{ y: 4 }}
        transition={{ duration: 0.12 }}
        className="relative z-10 flex size-9 items-center justify-center rounded-full text-[#0E0E0E]"
      >
        <ArrowDown className="size-5" strokeWidth={1.5} />
      </motion.div>
    </button>
  );
});
