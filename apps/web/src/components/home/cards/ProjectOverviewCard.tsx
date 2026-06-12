"use client";

import { memo } from "react";
import { AvatarStack } from "../ui/AvatarStack";

export const ProjectOverviewCard = memo(function ProjectOverviewCard() {
  return (
    <div className="w-48 rounded-2xl bg-white p-4 shadow-xl shadow-sky-950/10">
      <p className="text-sm font-semibold text-slate-900">Project Overview</p>
      <p className="mt-0.5 text-[11px] text-slate-500">Website Redesign</p>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-slate-500">Progress</span>
        <span className="font-semibold text-slate-900">75%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100">
        <div className="h-full w-3/4 rounded-full bg-blue-500" />
      </div>
      <div className="mt-3">
        <AvatarStack count="+3" />
      </div>
    </div>
  );
});
