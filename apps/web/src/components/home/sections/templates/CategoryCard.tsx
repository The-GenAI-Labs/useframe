"use client";

import { memo, useCallback } from "react";
import { Copy } from "lucide-react";
import type { Category } from "./categories";

export const CategoryCard = memo(function CategoryCard({
  category,
  index,
  active,
  onSelect,
}: {
  category: Category;
  index: number;
  active: boolean;
  onSelect: (index: number) => void;
}) {
  const Icon = category.icon;
  const handleClick = useCallback(() => onSelect(index), [index, onSelect]);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(category.prompt);
    },
    [category.prompt]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      aria-pressed={active}
      className={`group relative flex cursor-pointer items-center gap-2.5 rounded-xl border-[3px] border-white px-3 py-3.5 text-left shadow-md shadow-slate-200/60 transition-all select-none ${category.tone} ${
        active
          ? "-translate-y-0.5 hover:shadow-lg shadow-slate-500/30"
          : "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-300/50"
      }`}
    >
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${category.iconTone}`}>
        <Icon className="size-3.5" strokeWidth={1.75} />
      </span>
      <span className="flex-1 text-[12px] font-semibold text-slate-800">{category.title}</span>
      <span className="h-5 w-px shrink-0 border-l border-dashed border-slate-300" />
      <div
        role="button"
        tabIndex={0}
        onClick={handleCopy}
        onKeyDown={(e) => { if (e.key === "Enter") handleCopy(e as unknown as React.MouseEvent); }}
        aria-label={`Copy ${category.title} prompt`}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700 active:scale-90"
      >
        <Copy className="size-3" strokeWidth={2} />
      </div>
    </div>
  );
});
