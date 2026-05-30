"use client";

import { memo, useCallback } from "react";

export const NAV_ITEMS = [
    "General",
    "Account",
    "Privacy",
    "Billing",
    "Usage",
    "Capabilities",
    "Connectors",
    "Claude Code",
    "Claude in Chrome",
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

interface SettingsNavProps {
    active: NavItem;
    onChange: (item: NavItem) => void;
}

export const SettingsNav = memo(function SettingsNav({ active, onChange }: SettingsNavProps) {
    const handleClick = useCallback((item: NavItem) => () => onChange(item), [onChange]);

    return (
        <aside className="w-52 shrink-0 px-4 pt-10 pb-6 flex flex-col gap-0.5 border-r border-black/[0.07]">
            <h1 className="text-[22px] font-bold text-black/85 mb-5 px-2">Settings</h1>
            {NAV_ITEMS.map((item) => (
                <button
                    key={item}
                    type="button"
                    onClick={handleClick(item)}
                    className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-[13.5px] transition-colors cursor-pointer ${
                        active === item
                            ? "bg-black/6 text-black/85 font-medium"
                            : "text-black/45 hover:text-black/65 hover:bg-black/4"
                    }`}
                >
                    <span>{item}</span>
                    {item === "Claude in Chrome" && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-black/6 text-black/40">Beta</span>
                    )}
                </button>
            ))}
        </aside>
    );
});
