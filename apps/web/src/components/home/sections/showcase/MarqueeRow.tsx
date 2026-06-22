"use client";

import { memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export const MarqueeRow = memo(function MarqueeRow({ images, reverse }: { images: string[]; reverse?: boolean }) {
  return (
    <div className="overflow-hidden">
      <motion.div
        className="flex w-max gap-4 py-2"
        animate={{ x: reverse ? ["-50%", "0%"] : ["0%", "-50%"] }}
        transition={{ duration: 55, ease: "linear", repeat: Infinity }}
      >
        {[...images, ...images].map((src, i) => (
          <div
            key={`${src}-${i}`}
            className="relative aspect-4/3 w-64 shrink-0 overflow-hidden rounded-2xl border border-white/60 bg-white shadow-lg shadow-sky-950/10 sm:w-72"
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
      </motion.div>
    </div>
  );
});
