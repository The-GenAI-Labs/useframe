"use client";

import { useState, useCallback } from "react";
import { SettingsNav, type NavItem } from "./SettingsNav";
import { GeneralPanel } from "./panels/GeneralPanel";
import { PlaceholderPanel } from "./panels/PlaceholderPanel";

export default function SettingsView() {
    const [active, setActive] = useState<NavItem>("General");
    const handleChange = useCallback((item: NavItem) => setActive(item), []);

    return (
        <div className="flex h-full w-full bg-surface overflow-hidden">
            <SettingsNav active={active} onChange={handleChange} />
            <main className="flex-1 overflow-y-auto px-10 pt-10 pb-12" style={{ scrollbarWidth: "none" }}>
                <div className="max-w-xl">
                    {active === "General" ? (
                        <GeneralPanel />
                    ) : (
                        <PlaceholderPanel title={active} />
                    )}
                </div>
            </main>
        </div>
    );
}
