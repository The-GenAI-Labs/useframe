"use client";

import { memo } from "react";

// Video plays fully visible top-to-bottom — no wash overlay across it.
// Only a soft smoke/fade right at the very bottom, so it blends into the
// white content below instead of ending on a hard edge.
export const BackgroundClouds = memo(function BackgroundClouds() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/chat/useframecloud.jpg"
        className="absolute inset-0 size-full object-cover"
        src="/chat/useframe%20landing%20paint%20vid.mp4"
      />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-white/80 to-transparent" />
    </div>
  );
});
