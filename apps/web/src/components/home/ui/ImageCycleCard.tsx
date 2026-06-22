"use client";

import { memo, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";

type ImageCycleCardProps = {
  images: string[];
  label: string;
  interval?: number;
};

export const ImageCycleCard = memo(function ImageCycleCard({ images, label, interval = 2500 }: ImageCycleCardProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % images.length), interval);
    return () => clearInterval(id);
  }, [images.length, interval]);

  return (
    <div className="w-64 rounded-2xl border border-white/50 bg-white/30 p-2 shadow-xl shadow-sky-950/10 backdrop-blur-md">
      <div className="relative aspect-2/3 w-full overflow-hidden rounded-xl bg-slate-100">
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            className="absolute inset-0"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            exit={{ y: "-100%" }}
            transition={{ duration: 0.65, ease: [0.32, 0.72, 0, 1] }}
          >
            <Image
              src={images[index]}
              alt={`${label} landing page design`}
              fill
              sizes="256px"
              className="object-cover object-top"
            />
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="px-1.5 py-1.5 text-[11px] font-medium text-slate-700">{label}</p>
    </div>
  );
});
