"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { serif } from "../fonts";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
};

export const SectionHeading = memo(function SectionHeading({ eyebrow, title, description }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mx-auto max-w-2xl text-center"
    >
      <span className="inline-block rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600">
        {eyebrow}
      </span>
      <h2 className={`${serif.className} mt-4 text-4xl tracking-tight text-slate-950 sm:text-5xl`}>
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">{description}</p>
      ) : null}
    </motion.div>
  );
});
