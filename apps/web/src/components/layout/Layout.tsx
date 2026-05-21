"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex items-center justify-center h-screen w-screen bg-white">
            <div
                className="flex h-[95vh] w-[97vw] rounded-4xl overflow-hidden transition-all duration-300 ease-in-out"
            >
                {/* Sidebar — transparent bg, slides in */}
                <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(p => !p)} />

                {/* Main content — always fully rounded */}
                <main className="relative flex-1 bg-orange-100 overflow-y-auto rounded-4xl transition-all duration-300 ease-in-out">
                    {/* Toggle — only visible when sidebar is CLOSED */}
                    {!sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="absolute top-4 left-4 z-50 p-1.5 rounded-lg transition-colors text-white/70 hover:text-white cursor-pointer"
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