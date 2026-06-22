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
    <section aria-label="Design showcase" className="relative z-10 w-full overflow-hidden pt-8 pb-16">
      <div className="mt-0 space-y-3">
        <MarqueeRow images={ROW_TOP} />
        <MarqueeRow images={ROW_BOTTOM} reverse />
      </div>
    </section>
  );
});
