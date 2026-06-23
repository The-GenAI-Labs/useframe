"use client";

import { memo } from "react";

export const FiveCornerBlob = memo(function FiveCornerBlob({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <div className="relative h-auto w-full">
      <svg
        viewBox="0 -10 900 730"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="fiveCornerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#003FCC" />
            <stop offset="45%" stopColor="#0057FF" />
            <stop offset="100%" stopColor="#001A66" />
          </linearGradient>
          <filter id="grain" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.72 0.68" numOctaves="4" seed="8" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feComponentTransfer in="grayNoise" result="contrastNoise">
              <feFuncR type="linear" slope="3.5" intercept="-1.2" />
              <feFuncG type="linear" slope="3.5" intercept="-1.2" />
              <feFuncB type="linear" slope="3.5" intercept="-1.2" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" in2="contrastNoise" mode="overlay" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="shadowFive" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="25" stdDeviation="25" floodOpacity="0.2" />
          </filter>
        </defs>
        <path
          d={`M 70 0 H 830 C 870 0 900 30 900 70 V 500 C 900 550 860 580 800 580 C 700 580 620 620 560 650 H 70 C 30 650 0 620 0 580 V 70 C 0 30 30 0 70 0 Z`}
          fill="url(#fiveCornerGradient)"
          filter="url(#shadowFive)"
          stroke="white"
          strokeWidth="18"
        />
        <path
          d={`M 70 0 H 830 C 870 0 900 30 900 70 V 500 C 900 550 860 580 800 580 C 700 580 620 620 560 650 H 70 C 30 650 0 620 0 580 V 70 C 0 30 30 0 70 0 Z`}
          fill="white"
          opacity="0.22"
          filter="url(#grain)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center p-10">
        {children}
      </div>
    </div>
  );
});
