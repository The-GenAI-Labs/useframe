"use client";

import { memo } from "react";
import { MarqueeRow } from "./showcase/MarqueeRow";

const ROW_TOP = [
  "/auth/landing1.png",
  "/auth/login2.png",
  "/auth/login5.png",
  "/auth/login8.png",
  "/auth/login13.png",
  "/auth/login17.png",
  "/auth/login20.png",
];

const ROW_BOTTOM = [
  "/auth/landing2.png",
  "/auth/login1.png",
  "/auth/login4.png",
  "/auth/login9.png",
  "/auth/login14.png",
  "/auth/login16.png",
  "/auth/login18.png",
];

export const ShowcaseCarousel = memo(function ShowcaseCarousel() {
  return (
    <section
      aria-label="Design showcase"
      className="relative z-10 w-full overflow-hidden pt-8 pb-16"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-[100px] bg-linear-to-r from-white via-white/95 to-transparent drop-shadow-[18px_0_20px_rgba(255,255,255,0.92)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-[100px] bg-linear-to-l from-white via-white/95 to-transparent drop-shadow-[-18px_0_20px_rgba(255,255,255,0.92)]"
      />
      <div className="mt-0 space-y-3">
        <MarqueeRow images={ROW_TOP} />
        <MarqueeRow images={ROW_BOTTOM} reverse />
      </div>
    </section>
  );
});
