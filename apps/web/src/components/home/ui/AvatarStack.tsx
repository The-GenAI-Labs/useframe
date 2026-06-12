"use client";

import { memo } from "react";

const COLORS = [
  "bg-linear-to-br from-orange-300 to-rose-400",
  "bg-linear-to-br from-sky-300 to-blue-500",
  "bg-linear-to-br from-emerald-300 to-teal-500",
];

export const AvatarStack = memo(function AvatarStack({ count }: { count: string }) {
  return (
    <div className="flex -space-x-1.5">
      {COLORS.map((color) => (
        <span key={color} className={`size-5 rounded-full ring-2 ring-white ${color}`} />
      ))}
      <span className="flex size-5 items-center justify-center rounded-full bg-slate-100 text-[8px] font-semibold text-slate-600 ring-2 ring-white">
        {count}
      </span>
    </div>
  );
});
