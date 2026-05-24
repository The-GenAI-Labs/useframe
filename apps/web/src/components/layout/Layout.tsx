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
        <div className="flex items-center justify-center h-screen w-screen bg-white">
            <div className="flex h-[95vh] w-[97vw] transition-all duration-300 ease-in-out">

                <Sidebar isOpen={sidebarOpen} onToggle={() => handleToggle(false)} />

                <main className="relative flex-1 bg-white border border-gray-300 rounded-4xl overflow-y-auto transition-all duration-300 ease-in-out">
                    {showToggle && !sidebarOpen && (
                        <button
                            onClick={() => handleToggle(true)}
                            className="absolute top-4 left-4 z-50 p-1.5 rounded-lg transition-colors text-black/40 hover:text-black/70 cursor-pointer"
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