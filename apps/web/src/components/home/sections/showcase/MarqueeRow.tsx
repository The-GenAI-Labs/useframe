"use client";

import { memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export const MarqueeRow = memo(function MarqueeRow({
  images,
  reverse,
}: {
  images: string[];
  reverse?: boolean;
}) {
  return (
    <div className="overflow-hidden">
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
                className="relative aspect-4/3 w-64 shrink-0 overflow-hidden rounded-[25px] border-[10px] border-white bg-white shadow-lg shadow-sky-950/10 sm:w-72"
              >
                <Image
                  src={src}
                  alt="Landing page design generated with UseFrame"
                  fill
                  sizes="(max-width: 640px) 256px, 288px"
                  className="object-cover object-top"
                />
              </div>
            ))}
          </div>
        ))}
      </motion.div>
    </div>
  );
});
