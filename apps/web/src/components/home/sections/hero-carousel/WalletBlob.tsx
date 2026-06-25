"use client";

import { memo } from "react";

export const WalletBlob = memo(function WalletBlob({
  children,
  title,
}: {
  children?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="relative h-auto w-full">
      <svg
        viewBox="0 -10 900 820"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id="walletGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
          <filter id="shadowWallet" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="25" stdDeviation="25" floodOpacity="0.12" floodColor="#94a3b8" />
          </filter>
        </defs>
        <path
          d={`M 70 0 H 830 C 870 0 900 30 900 70 V 540 C 900 580 870 610 830 610 C 760 610 720 620 680 670 C 620 740 280 740 220 670 C 180 620 140 610 70 610 C 30 610 0 580 0 540 V 70 C 0 30 30 0 70 0 Z`}
          fill="url(#walletGradient)"
          filter="url(#shadowWallet)"
          stroke="white"
          strokeWidth="18"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col justify-start p-10 pt-6">
        {title ? (
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {title}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
});
