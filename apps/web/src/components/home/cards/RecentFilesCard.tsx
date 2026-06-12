"use client";

import { memo } from "react";
import { FileText, Figma } from "lucide-react";

export const RecentFilesCard = memo(function RecentFilesCard() {
  return (
    <div className="w-48 rounded-2xl bg-white p-4 shadow-xl shadow-sky-950/10">
      <p className="text-sm font-semibold text-slate-900">Recent Files</p>

      <div className="mt-3 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-red-100">
          <FileText className="size-3.5 text-red-500" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-900">Brand Guidelines.pdf</p>
          <p className="text-[9px] text-slate-400">24 MB &middot; PDF</p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-900">
          <Figma className="size-3.5 text-white" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-slate-900">Homepage.fig</p>
          <p className="text-[9px] text-slate-400">12.6 MB &middot; Figma</p>
        </div>
      </div>
    </div>
  );
});
