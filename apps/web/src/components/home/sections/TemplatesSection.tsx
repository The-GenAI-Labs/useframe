"use client";

import { memo, useCallback, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SectionHeading } from "../ui/SectionHeading";
import { ShowcaseCard } from "./templates/ShowcaseCard";
import { CategoryCard } from "./templates/CategoryCard";
import { CATEGORIES } from "./templates/categories";

export const TemplatesSection = memo(function TemplatesSection() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion() ?? false;

  const handleSelect = useCallback((index: number) => setActive(index), []);
  const handlePrev = useCallback(
    () => setActive((i) => (i - 1 + CATEGORIES.length) % CATEGORIES.length),
    []
  );
  const handleNext = useCallback(
    () => setActive((i) => (i + 1) % CATEGORIES.length),
    []
  );

  const current = CATEGORIES[active];

  return (
    <section id="templates" className="relative z-10 w-full scroll-mt-24 overflow-hidden px-6 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-0 w-1/2"
        style={{
          maskImage: "linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.40) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.40) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[53rem]">
        <SectionHeading
          eyebrow="Templates"
          title="Start from something beautiful"
          description="Production-ready templates for every industry, generated and customised by AI."
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mt-8"
        >
          <ShowcaseCard
            category={current}
            onPrev={handlePrev}
            onNext={handleNext}
            reduced={reduced}
          />
        </motion.div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((category, i) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: "easeOut" }}
            >
              <CategoryCard
                category={category}
                index={i}
                active={i === active}
                onSelect={handleSelect}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
});
