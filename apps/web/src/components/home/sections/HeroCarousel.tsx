"use client";

import { memo, useCallback, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { serif } from "../fonts";
import { FiveCornerBlob } from "./hero-carousel/FiveCornerBlob";
import { WalletBlob } from "./hero-carousel/WalletBlob";
import { ImageGallery } from "./hero-carousel/ImageGallery";
import { ArrowToggle } from "./hero-carousel/ArrowToggle";
import { SLIDES } from "./hero-carousel/slides";

const E = [0.22, 1, 0.36, 1] as const;

export const HeroCarousel = memo(function HeroCarousel() {
  const [idx, setIdx] = useState(0);
  const reduced = useReducedMotion() ?? false;

  const advance = useCallback(() => setIdx((i) => (i + 1) % SLIDES.length), []);

  const slide = SLIDES[idx];
  const tx = reduced ? { duration: 0.15 } : { duration: 0.5, ease: E };

  const contentVariants = {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 22 },
    animate: reduced ? { opacity: 1 } : { opacity: 1, y: 0 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, y: -16 },
  };

  return (
    <section id="research" className="relative w-full scroll-mt-24 px-6 py-8 sm:py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-1/2 overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 35%, transparent 100%)",
          backgroundImage:
            "linear-gradient(rgba(37,99,235,0.40) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(37,99,235,0.40) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mx-auto mb-12 max-w-2xl text-center"
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

        <div className="grid grid-cols-1 items-center gap-10 pb-16 lg:grid-cols-2 lg:gap-8">
          <div className="relative">
            <FiveCornerBlob>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`left-${idx}`}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={tx}
                  className="w-full"
                >
                  {slide.leftContent}
                </motion.div>
              </AnimatePresence>
            </FiveCornerBlob>
          </div>

          <div className="relative">
            <WalletBlob title={slide.imageTitle}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`right-${idx}`}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={tx}
                  className="h-40 w-full"
                >
                  <ImageGallery images={slide.images} title={slide.imageTitle} />
                </motion.div>
              </AnimatePresence>
            </WalletBlob>
          </div>
        </div>

        <div className="absolute bottom-20 left-1/2 z-20 hidden -translate-x-1/2 lg:block">
          <ArrowToggle onClick={advance} reduced={reduced} />
        </div>

        <div className="relative z-20 mt-4 flex justify-center lg:hidden">
          <ArrowToggle onClick={advance} reduced={reduced} />
        </div>
      </div>
    </section>
  );
});
