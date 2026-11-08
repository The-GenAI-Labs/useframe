"use client";

import { memo, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { landingFont as serif } from "../fonts";
import { ResearchSection } from "./ResearchSection";

export const HeroCarousel = memo(function HeroCarousel() {
  const prefersReducedMotion = useReducedMotion();
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(prefersReducedMotion ?? false);
  }, [prefersReducedMotion]);
  return (
    <section
      id="research"
      aria-labelledby="research-heading"
      className="relative w-full scroll-mt-24 py-8 sm:py-10"
    >
      <div className="relative z-10 px-6">
        <motion.div
          initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: reduced ? 0 : 0.6, ease: "easeOut" }}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
            Research
          </span>
          <h2
            id="research-heading"
            className={`${serif.className} mt-4 text-4xl tracking-tight text-slate-950 sm:text-5xl`}
          >
            Make informed design decisions
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
            Explore website assessments, competitor insights, and research to
            guide your next step.
          </p>
        </motion.div>
      </div>
      <ResearchSection />
    </section>
  );
});
