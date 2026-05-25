"use client";

import { memo } from "react";

const CHIPS = [
    { label: "Research UI best practices", icon: "🔍" },
    { label: "Browse my templates", icon: "📐" },
    { label: "Suggest a page layout", icon: "🖼️" },
    { label: "Improve my design system", icon: "✨" },
];

interface SuggestionChipsProps {
    onSelect: (text: string) => void;
}

export const SuggestionChips = memo(function SuggestionChips({ onSelect }: SuggestionChipsProps) {
    return (
        <div className="flex flex-wrap gap-2 justify-center">
            {CHIPS.map((chip) => (
                <button
                    key={chip.label}
                    type="button"
                    onClick={() => onSelect(chip.label)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/8 bg-white text-xs text-black/55 hover:text-black/80 hover:border-black/15 hover:bg-gray-50 transition-all duration-150 cursor-pointer whitespace-nowrap shadow-sm"
                >
                    <span className="text-[11px]">{chip.icon}</span>
                    {chip.label}
                </button>
            ))}
        </div>
    );
});
