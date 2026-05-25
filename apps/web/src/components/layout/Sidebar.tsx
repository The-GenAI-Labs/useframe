"use client";

import { useState } from "react";
import { useChatModalStore } from "@/store/chatModalStore";

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

const sampleStarred = [
    { id: 1, label: "Landing page copy" },
    { id: 2, label: "API docs rewrite" },
    { id: 3, label: "Pitch deck outline" },
];

const sampleProjects = [
    { id: 1, label: "useframe web" },
    { id: 2, label: "Mobile app" },
    { id: 3, label: "Design system" },
];

const sampleChats = [
    { id: 1, label: "Esther Howard", avatar: "E" },
    { id: 2, label: "Jacob Jones", avatar: "J" },
    { id: 3, label: "Cody Fisher", avatar: "C" },
];

const NAV_BTN = "group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-black/50 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150 text-[13.5px] font-medium cursor-pointer";
const NAV_ICON = "shrink-0 text-black/35 group-hover:text-blue-500 transition-colors duration-150";
const SECTION_BTN = "w-full flex items-center justify-between px-3 py-2 rounded-xl text-black/40 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150 cursor-pointer";
const SECTION_LABEL = "flex items-center gap-2.5 text-[11.5px] font-semibold tracking-widest uppercase whitespace-nowrap";
const ITEM_BTN = "group w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-black/50 hover:text-blue-600 hover:bg-blue-50 transition-all duration-150 text-[13px] font-medium text-left cursor-pointer";

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
    const [starredOpen, setStarredOpen] = useState(true);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [chatsOpen, setChatsOpen] = useState(false);
    const openChatModal = useChatModalStore((s) => s.open);

    return (
        <aside
            className={`
                flex flex-col h-full bg-white
                transition-all duration-300 ease-in-out shrink-0 overflow-hidden
                ${isOpen ? "w-64" : "w-0"}
            `}
        >
            {/* logo toggl*/}
            <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
                <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="white">
                            <rect x="3" y="3" width="8" height="8" rx="1.5" />
                            <rect x="13" y="3" width="8" height="8" rx="1.5" />
                            <rect x="3" y="13" width="8" height="8" rx="1.5" />
                            <rect x="13" y="13" width="8" height="8" rx="1.5" />
                        </svg>
                    </div>
                    <span className="text-black text-[15px] font-bold tracking-tight">useframe</span>
                </div>
                <button
                    onClick={onToggle}
                    className="text-black/30 hover:text-black/60 transition-colors p-1.5 rounded-lg cursor-ew-resize"
                >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
            </div>

            <div className="px-3 pb-4 shrink-0">
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-black/4 border border-black/[0.07]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-black/30 shrink-0">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search"
                        className="flex-1 bg-transparent text-[13px] text-black/60 placeholder:text-black/25 outline-none min-w-0"
                    />
                    <div className="flex items-center gap-0.5 shrink-0">
                        <kbd className="text-[10px] text-black/25 font-medium px-1.5 py-0.5 rounded-md bg-black/6">⌘</kbd>
                        <kbd className="text-[10px] text-black/25 font-medium px-1.5 py-0.5 rounded-md bg-black/6">S</kbd>
                    </div>
                </div>
            </div>

            <div className="px-3 pb-3 flex gap-2 shrink-0">
                <button className="group flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/[0.03] hover:bg-blue-50 border border-black/[0.07] hover:border-blue-200 transition-all duration-150 cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-black/35 group-hover:text-blue-500 transition-colors">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span className="text-[12.5px] font-semibold text-black/40 group-hover:text-blue-600 whitespace-nowrap transition-colors">New Project</span>
                </button>

                <button onClick={openChatModal} className="group flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-black/3 hover:bg-blue-50 border border-black/[0.07] hover:border-blue-200 transition-all duration-150 cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-black/35 group-hover:text-blue-500 transition-colors">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="10" y1="11" x2="14" y2="11" />
                    </svg>
                    <span className="text-[12.5px] font-semibold text-black/40 group-hover:text-blue-600 whitespace-nowrap transition-colors">New Chat</span>
                </button>
            </div>

            <div className="px-3 pb-3 flex flex-col gap-1 shrink-0">
                <button className={NAV_BTN}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={NAV_ICON}>
                        <circle cx="12" cy="12" r="10" />
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                    </svg>
                    Research
                </button>
                <button className={NAV_BTN}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={NAV_ICON}>
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    Templates
                </button>
            </div>

            <div className="mx-4 border-t border-black/35 border-dashed mb-3 shrink-0" />

            <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-1.5 pb-2">

                {/* Starred */}
                <div>
                    <button onClick={() => setStarredOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            Starred
                        </span>
                        <ChevronIcon open={starredOpen} />
                    </button>
                    {starredOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleStarred.map(item => (
                                <button key={item.id} className={ITEM_BTN}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-black/30 group-hover:text-blue-400 transition-colors">
                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                    </svg>
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <button onClick={() => setProjectsOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            Projects
                        </span>
                        <ChevronIcon open={projectsOpen} />
                    </button>
                    {projectsOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleProjects.map(item => (
                                <button key={item.id} className={ITEM_BTN}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-black/30 group-hover:text-blue-400 transition-colors">
                                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <button onClick={() => setChatsOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            Chats
                        </span>
                        <ChevronIcon open={chatsOpen} />
                    </button>
                    {chatsOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleChats.map(item => (
                                <button key={item.id} className={ITEM_BTN}>
                                    <div className="w-6 h-6 rounded-full bg-black/10 group-hover:bg-blue-100 flex items-center justify-center text-black/50 group-hover:text-blue-500 text-[10px] font-semibold shrink-0 transition-colors">
                                        {item.avatar}
                                    </div>
                                    <span className="truncate">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            <div className="px-3 py-4 shrink-0 border-t border-black/[0.07]">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-black/55 text-sm font-bold shrink-0">
                        J
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-black/75 text-[13px] font-semibold truncate leading-tight">John Doe</p>
                        <p className="text-black/30 text-[11px] truncate leading-tight">john@example.com</p>
                    </div>

                    <button
                        title="Settings"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-black/10 bg-white text-black/35 hover:text-blue-500 hover:border-blue-300 hover:bg-blue-50 transition-all duration-150 cursor-pointer shrink-0"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>

                    <button
                        title="Log out"
                        className="w-8 h-8 flex items-center justify-center rounded-xl border border-black/10 bg-white text-black/35 hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-all duration-150 cursor-pointer shrink-0"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                </div>
            </div>
        </aside>
    );
}
