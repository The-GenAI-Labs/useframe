"use client";

import { memo } from "react";
import { MessageSquare, Folder } from "lucide-react";
import { AvatarStack } from "../ui/AvatarStack";

export const TeamCollabCard = memo(function TeamCollabCard() {
  return (
    <div className="w-52 rounded-2xl bg-amber-50 p-4 shadow-xl shadow-sky-950/10">
      <p className="text-sm font-semibold leading-snug text-slate-900">
        Team Collaboration Made Simple
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        Chat, share and collaborate in real-time with your team.
      </p>
      <div className="mt-3 flex items-center justify-between">
        <AvatarStack count="+8" />
        <div className="flex gap-1.5">
          <span className="flex size-6 items-center justify-center rounded-lg bg-white shadow-sm">
            <MessageSquare className="size-3 text-green-600" />
          </span>
          <span className="flex size-6 items-center justify-center rounded-lg bg-white shadow-sm">
            <Folder className="size-3 text-amber-500" />
          </span>
        </div>
      </div>
    </div>
  );
});
