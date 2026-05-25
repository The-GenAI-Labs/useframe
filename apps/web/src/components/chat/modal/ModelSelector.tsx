"use client";

import { memo, useState } from "react";

const MODELS = ["GPT-5.2", "GPT-4o", "Claude Sonnet", "Gemini 1.5"];

export const ModelSelector = memo(function ModelSelector() {
    const [selected, setSelected] = useState("GPT-5.2");
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-black/8 bg-white text-[11px] font-medium text-black/60 hover:border-black/15 hover:text-black/80 transition-all cursor-pointer shadow-sm"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {selected}
                <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 text-[9px] font-semibold leading-none">New</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {open && (
                <div className="absolute bottom-full mb-1.5 left-0 bg-white border border-black/10 rounded-xl shadow-lg py-1 z-50 min-w-[140px]">
                    {MODELS.map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => { setSelected(m); setOpen(false); }}
                            className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${selected === m ? "text-blue-600 bg-blue-50 font-medium" : "text-black/60 hover:bg-gray-50"}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});
