"use client";

import { memo, useId } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export const MarqueeRow = memo(function MarqueeRow({
  images,
  reverse,
}: {
  images: string[];
  reverse?: boolean;
}) {
  const grainId = useId();

  return (
    <div className="overflow-hidden">
      <svg aria-hidden width="0" height="0" className="absolute">
        <filter
          id={grainId}
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
            seed="19"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix type="saturate" values="0" in="noise" />
        </filter>
      </svg>
      <motion.div
        className="flex w-max py-2 will-change-transform"
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: 72, ease: "linear", repeat: Infinity }}
      >
        {[0, 1].map((copyIndex) => (
          <div
            key={copyIndex}
            className="flex shrink-0 gap-4 pr-4"
            aria-hidden={copyIndex === 1}
          >
            {images.map((src) => (
              <div
                key={`${copyIndex}-${src}`}
                className="relative aspect-4/3 w-64 shrink-0 overflow-hidden rounded-[25px] bg-linear-to-br from-blue-50 via-blue-100 to-blue-300 p-[10px] shadow-[0_14px_34px_-12px_rgba(30,64,175,0.35)] sm:w-72"
              >
                <svg
                  aria-hidden
                  className="pointer-events-none absolute inset-0 h-full w-full opacity-30 mix-blend-soft-light"
                >
                  <rect
                    width="100%"
                    height="100%"
                    filter={`url(#${grainId})`}
                  />
                </svg>
                <div className="relative z-10 h-full w-full overflow-hidden rounded-[15px] bg-white">
                  <Image
                    src={src}
                    alt="Landing page design generated with UseFrame"
                    fill
                    sizes="(max-width: 640px) 256px, 288px"
                    className="object-cover object-top"
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
});
