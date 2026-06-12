"use client";

import { memo } from "react";
import { motion } from "framer-motion";

export const Hero = memo(function Hero({ serifClassName }: { serifClassName: string }) {
  return (
    <section className="relative z-10 mx-auto w-full max-w-300 text-center">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`${serifClassName} text-balance text-5xl leading-[0.98] tracking-tight text-slate-950 sm:text-7xl xl:text-8xl`}
      >
        One portal for every
        <br />
        project &amp; client
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
        className="mx-auto mt-6 max-w-160 text-pretty text-sm leading-relaxed text-slate-700 sm:text-base"
      >
        A modern client portal that replaces scattered emails, messy threads, and
        lost files with one clean, structured space your clients can rely on every day.
      </motion.p>
    </section>
  );
});
