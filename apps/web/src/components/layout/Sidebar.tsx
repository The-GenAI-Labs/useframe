"use client";

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
    return (
        <aside
            className={`
                flex flex-col h-full bg-white border-r border-black/15
                transition-all duration-300 ease-in-out shrink-0 overflow-hidden
                ${isOpen ? "w-64" : "w-0"}
            `}
        >
            {/* Top */}
            <div className="flex items-center justify-between px-4 py-4">
                <span className="text-black/60 text-sm font-medium tracking-wide whitespace-nowrap">
                    UseFrame
                </span>
                <button
                    onClick={onToggle}
                    className="text-black/40 hover:text-black/70 transition-colors p-1 rounded-md cursor-pointer"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
            </div>

            {/* New chat */}
            <div className="px-3 pb-2">
                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-black/40 hover:text-black/70 hover:bg-black/5 transition-all text-sm whitespace-nowrap cursor-pointer">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New conversation
                </button>
            </div>

            {/* Conversations */}
            <div className="flex-1 overflow-y-auto px-3">
                <p className="text-black/20 text-xs px-2 py-2 uppercase tracking-widest whitespace-nowrap">
                    Recent
                </p>
            </div>

            {/* User */}
            <div className="px-3 py-4">
                <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-black/5 transition-all cursor-pointer">
                    <div className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-black/50 text-xs shrink-0">
                        U
                    </div>
                    <p className="text-black/60 text-sm truncate whitespace-nowrap">User</p>
                </div>
            </div>
        </aside>
    );
}