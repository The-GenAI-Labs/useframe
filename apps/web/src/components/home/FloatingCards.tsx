"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import { ImageCycleCard } from "./ui/ImageCycleCard";

const LEFT_IMAGES = [
  "/auth/landing1.png",
  "/auth/login1.png",
  "/auth/login3.png",
  "/auth/login5.png",
  "/auth/login7.png",
  "/auth/login9.png",
  "/auth/login13.png",
  "/auth/login16.png",
  "/auth/login17.png",
];

const RIGHT_IMAGES = [
  "/auth/landing2.png",
  "/auth/login2.png",
  "/auth/login4.png",
  "/auth/login6.png",
  "/auth/login8.png",
  "/auth/login10.png",
  "/auth/login12.png",
  "/auth/login14.png",
  "/auth/login18.png",
  "/auth/login20.png",
];

export const FloatingCards = memo(function FloatingCards() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-5 hidden xl:block">
      <motion.div
        className="pointer-events-auto absolute left-[6%] top-[18%]"
        initial={{ opacity: 0, y: 24, rotate: -2, scale: 0.94 }}
        animate={{ opacity: 1, y: [0, -8, 0], rotate: -2, scale: 1 }}
        whileHover={{ rotate: 0, scale: 1.03, zIndex: 20 }}
        transition={{
          opacity: { duration: 0.8, delay: 0.2 },
          scale: { duration: 0.8, delay: 0.2 },
          y: { duration: 7, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <ImageCycleCard images={LEFT_IMAGES} label="Generated with UseFrame" interval={2400} />
      </motion.div>

      <motion.div
        className="pointer-events-auto absolute right-[6%] top-[18%]"
        initial={{ opacity: 0, y: 24, rotate: 2, scale: 0.94 }}
        animate={{ opacity: 1, y: [0, -8, 0], rotate: 2, scale: 1 }}
        whileHover={{ rotate: 0, scale: 1.03, zIndex: 20 }}
        transition={{
          opacity: { duration: 0.8, delay: 0.4 },
          scale: { duration: 0.8, delay: 0.4 },
          y: { duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.6 },
        }}
      >
        <ImageCycleCard images={RIGHT_IMAGES} label="Designed in seconds" interval={3000} />
      </motion.div>
    </div>
  );
});
