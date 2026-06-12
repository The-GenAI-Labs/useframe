"use client";

import { memo } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May"];

export const AnalyticsCard = memo(function AnalyticsCard() {
  return (
    <div className="w-64 rounded-2xl bg-white p-4 shadow-xl shadow-sky-950/10">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold leading-snug text-slate-900">
            Grow your business with insights that matter
          </p>
          <p className="mt-1.5 text-[9px] leading-relaxed text-slate-500">
            Analytics and reporting tools to help you make better decisions.
          </p>
          <span className="mt-2 inline-block rounded-full bg-lime-300 px-2 py-1 text-[8px] font-semibold text-slate-900">
            Explore Dashboard
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[9px] text-slate-400">Total Revenue</p>
          <div className="flex items-baseline gap-1">
            <p className="text-base font-bold text-slate-900">$48,240</p>
            <span className="rounded-full bg-green-100 px-1 py-0.5 text-[8px] font-semibold text-green-600">
              +12.5%
            </span>
          </div>
          <svg viewBox="0 0 100 40" className="mt-1 h-12 w-full" aria-hidden="true">
            <path
              d="M0 30 L14 24 L28 27 L42 18 L56 21 L70 10 L84 14 L100 4 L100 40 L0 40 Z"
              fill="rgba(34,197,94,0.12)"
            />
            <path
              d="M0 30 L14 24 L28 27 L42 18 L56 21 L70 10 L84 14 L100 4"
              fill="none"
              stroke="#22c55e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="flex justify-between text-[7px] text-slate-400">
            {MONTHS.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
