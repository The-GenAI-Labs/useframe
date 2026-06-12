"use client";

import { memo } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

// deterministic positions — Math.random() would mismatch between server and client render
const PARTICLES = [
  { left: "12%", top: "24%", size: 5, delay: 0 },
  { left: "26%", top: "16%", size: 3, delay: 1.2 },
  { left: "38%", top: "30%", size: 4, delay: 2.4 },
  { left: "55%", top: "14%", size: 3, delay: 0.8 },
  { left: "68%", top: "26%", size: 5, delay: 1.8 },
  { left: "82%", top: "18%", size: 3, delay: 3 },
  { left: "90%", top: "34%", size: 4, delay: 0.4 },
  { left: "47%", top: "40%", size: 3, delay: 2 },
];

export const BackgroundClouds = memo(function BackgroundClouds() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <Image
        src="/chat/useframecloud.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      {/* heavy white wash on top — the reference sky is near-white with clouds only at the bottom */}
      <div className="absolute inset-0 bg-linear-to-b from-white/90 via-white/55 to-white/0" />

      <motion.div
        className="absolute -left-40 top-24 h-64 w-md rounded-full bg-white/50 blur-3xl"
        animate={{ x: [0, 60, 0] }}
        transition={{ duration: 48, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-48 top-40 h-72 w-xl rounded-full bg-white/40 blur-3xl"
        animate={{ x: [0, -70, 0] }}
        transition={{ duration: 56, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-1/3 top-2/3 h-80 w-160 rounded-full bg-white/30 blur-3xl"
        animate={{ x: [0, 40, 0] }}
        transition={{ duration: 64, repeat: Infinity, ease: "easeInOut" }}
      />

      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-white/70"
          style={{ left: p.left, top: p.top, width: p.size, height: p.size }}
          animate={{ y: [0, -14, 0], opacity: [0.25, 0.6, 0.25] }}
          transition={{ duration: 9 + i, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
        />
      ))}
    </div>
  );
});
