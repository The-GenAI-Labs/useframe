"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showToggle, setShowToggle] = useState(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleToggle = (next: boolean) => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (next) {
            setShowToggle(false);
            setSidebarOpen(true);
        } else {
            setSidebarOpen(false);
            timerRef.current = setTimeout(() => setShowToggle(true), 300);
        }
    };

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    return (
        <div className="flex items-center justify-center h-screen w-screen bg-shell">
            <div className="flex h-full md:h-[96vh] w-full md:w-[98vw] md:rounded-3xl overflow-hidden transition-all duration-300 ease-in-out">

                {sidebarOpen && (
                    <div
                        className="md:hidden fixed inset-0 z-40 bg-black/30"
                        onClick={() => handleToggle(false)}
                    />
                )}
                <div className={`
                    md:static fixed inset-y-0 left-0 z-50
                    transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
                `}>
                    <Sidebar isOpen={sidebarOpen} onToggle={() => handleToggle(!sidebarOpen)} />
                </div>

                <main className={`relative flex-1 h-full bg-surface overflow-hidden transition-all duration-300 ease-in-out md:rounded-r-3xl ${sidebarOpen ? "md:rounded-l-4xl" : ""}`}>
                    {showToggle && !sidebarOpen && (
                        <button
                            onClick={() => handleToggle(true)}
                            className="md:hidden absolute top-4 left-4 z-50 p-1.5 rounded-lg transition-colors text-sec hover:text-pri cursor-ew-resize"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="3" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                            </svg>
                        </button>
                    )}
                    {children}
                </main>

            </div>
        </div>
    );
}