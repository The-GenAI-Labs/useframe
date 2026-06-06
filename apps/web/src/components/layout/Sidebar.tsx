"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useChatModalStore } from "@/store/chatModalStore";
import { useSearchModalStore } from "@/store/searchModalStore";
import Image from "next/image";

interface SidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}

function FilledStarIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
}
function FilledFolderIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
}
function FilledChatIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
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
    { id: 1, label: "Product Design Request" },
    { id: 2, label: "Indexes in PostgreSQL" },
    { id: 3, label: "User table best practices" },
    { id: 4, label: "Polling with Node.js" },
];

function mkShare() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>; }
function mkRename() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function mkArchive() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>; }
function mkDelete() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
function mkFolder() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>; }
function mkPin() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>; }
function mkGroup() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function mkUnstar() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>; }

type DropdownOption = { label: string; icon: React.ReactNode; destructive?: boolean; onClick?: () => void };

const PROJECT_OPTIONS: DropdownOption[] = [
    { label: "Share", icon: mkShare() },
    { label: "Rename", icon: mkRename() },
    { label: "Archive", icon: mkArchive() },
    { label: "Delete", destructive: true, icon: mkDelete() },
];
const CHAT_OPTIONS: DropdownOption[] = [
    { label: "Share", icon: mkShare() },
    { label: "Start a group chat", icon: mkGroup() },
    { label: "Rename", icon: mkRename() },
    { label: "Move to project", icon: mkFolder() },
    { label: "Pin chat", icon: mkPin() },
    { label: "Archive", icon: mkArchive() },
    { label: "Delete", destructive: true, icon: mkDelete() },
];
const STARRED_OPTIONS: DropdownOption[] = [
    { label: "Unstar", icon: mkUnstar() },
    { label: "Rename", icon: mkRename() },
    { label: "Delete", destructive: true, icon: mkDelete() },
];

const H_BG  = "hover:[background-color:var(--bg-tertiary)]";
const H_BG2 = "hover:[background-color:var(--bg-bubble)]";
const H_TXT = "hover:[color:var(--text-primary)]";
const H_TXT2 = "hover:[color:var(--text-secondary)]";
const H_BDR = "hover:[border-color:var(--border-em)]";

const NAV_BTN = `group flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sec ${H_BG} ${H_TXT} transition-all duration-150 text-[13.5px] font-medium cursor-pointer`;
const SECTION_BTN = `w-full flex items-center justify-between px-3 py-2 rounded-xl text-mut ${H_BG} ${H_TXT2} transition-all duration-150 cursor-pointer`;
const SECTION_LABEL = "flex items-center gap-2.5 text-[11.5px] font-semibold tracking-widest uppercase whitespace-nowrap";

interface ItemDropdownProps {
    options: DropdownOption[];
    onClose: () => void;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const ItemDropdown = memo(function ItemDropdown({ options, onClose, triggerRef }: ItemDropdownProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const menuH = options.length * 38 + 16;
        const top = window.innerHeight - rect.bottom > menuH ? rect.bottom + 4 : rect.top - menuH - 4;
        setPos({ top, left: rect.left });
    }, [triggerRef, options.length]);

    useEffect(() => {
        const onMouse = (e: MouseEvent) => {
            if (menuRef.current?.contains(e.target as Node)) return;
            if (triggerRef.current?.contains(e.target as Node)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("mousedown", onMouse);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onMouse);
            document.removeEventListener("keydown", onKey);
        };
    }, [onClose, triggerRef]);

    return (
        <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999, backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            className="min-w-44 py-1.5 rounded-2xl"
        >
            {options.map((opt, i) => (
                <button
                    key={i}
                    onClick={() => { opt.onClick?.(); onClose(); }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium transition-colors duration-100 cursor-pointer text-left ${
                        opt.destructive
                            ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                            : "hover:[background-color:var(--bg-tertiary)] [color:var(--text-secondary)] hover:[color:var(--text-primary)]"
                    }`}
                >
                    <span className="shrink-0">{opt.icon}</span>
                    {opt.label}
                </button>
            ))}
        </div>
    );
});

interface SidebarItemProps { id: number; label: string; icon: React.ReactNode; dropdownOptions: DropdownOption[]; }

const SidebarItem = memo(function SidebarItem({ label, icon, dropdownOptions }: SidebarItemProps) {
    const [hovered, setHovered] = useState(false);
    const [dropOpen, setDropOpen] = useState(false);
    const dotsBtnRef = useRef<HTMLButtonElement>(null);
    const showDots = hovered || dropOpen;

    const handleDotsClick = useCallback((e: React.MouseEvent) => { e.stopPropagation(); setDropOpen(p => !p); }, []);
    const handleClose = useCallback(() => setDropOpen(false), []);

    return (
        <div className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <button
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-left transition-all duration-150 cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-tertiary)"; el.style.color = "var(--text-primary)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = ""; el.style.color = "var(--text-secondary)"; }}
            >
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>{icon}</span>
                <span className="truncate flex-1">{label}</span>
                <span className="shrink-0 transition-opacity duration-150" style={{ opacity: showDots ? 1 : 0, pointerEvents: showDots ? "auto" : "none" }}>
                    <button
                        ref={dotsBtnRef}
                        onClick={handleDotsClick}
                        className="w-5 h-5 flex items-center justify-center rounded-md transition-colors cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        onMouseEnter={e => { e.stopPropagation(); const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-bubble)"; el.style.color = "var(--text-secondary)"; }}
                        onMouseLeave={e => { e.stopPropagation(); const el = e.currentTarget as HTMLElement; el.style.backgroundColor = ""; el.style.color = "var(--text-muted)"; }}
                        aria-label="More options"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                    </button>
                </span>
            </button>
            {dropOpen && <ItemDropdown options={dropdownOptions} onClose={handleClose} triggerRef={dotsBtnRef} />}
        </div>
    );
});

export default function Sidebar({ isOpen, onToggle }: SidebarProps) {
    const [starredOpen, setStarredOpen] = useState(true);
    const [projectsOpen, setProjectsOpen] = useState(false);
    const [chatsOpen, setChatsOpen] = useState(false);

    const openChatModal = useChatModalStore((s) => s.open);
    const openSearch = useSearchModalStore((s) => s.open);
    const pathname = usePathname();
    const router = useRouter();

    const handleNewProject = useCallback(() => router.push("/"), [router]);

    return (
        <aside className={`
            flex flex-col h-full bg-shell md:rounded-l-3xl
            transition-all duration-300 ease-in-out shrink-0 overflow-hidden
            w-64 ${isOpen ? "md:w-64" : "md:w-0"}
        `}>
            <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
                <div className="flex items-center gap-2.5 whitespace-nowrap">
                    <div className="w-7 h-7 rounded-lg bg-gray-500 flex items-center justify-center shrink-0">
                        <Image src="/useFrame logo.png" alt="useframe logo" width={100} height={100} />
                    </div>
                    <span className="text-pri text-[15px] font-bold tracking-tight">useframe</span>
                </div>
                <button onClick={onToggle} className={`text-mut ${H_TXT2} transition-colors p-1.5 rounded-lg cursor-ew-resize`}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
            </div>

            <div className="px-3 pb-4 shrink-0">
                <button
                    onClick={openSearch}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition-all duration-150 cursor-pointer text-left"
                    style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border)" }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border-em)"; el.style.backgroundColor = "var(--bg-bubble)"; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = "var(--border)"; el.style.backgroundColor = "var(--bg-tertiary)"; }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span className="flex-1 text-[13px]" style={{ color: "var(--text-muted)" }}>Search</span>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <kbd className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-bubble)", borderColor: "var(--border)" }}>cmd</kbd>
                        <kbd className="text-[10px] font-medium px-1.5 py-0.5 rounded-md border" style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-bubble)", borderColor: "var(--border)" }}>S</kbd>
                    </div>
                </button>
            </div>

            <div className="px-3 pb-3 flex gap-2 shrink-0">
                <button
                    onClick={handleNewProject}
                    className="group flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer"
                    style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border)" }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-bubble)"; el.style.borderColor = "var(--border-em)"; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-tertiary)"; el.style.borderColor = "var(--border)"; }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>New Project</span>
                </button>
                <button
                    onClick={openChatModal}
                    className="group flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200 cursor-pointer"
                    style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border)" }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-bubble)"; el.style.borderColor = "var(--border-em)"; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.backgroundColor = "var(--bg-tertiary)"; el.style.borderColor = "var(--border)"; }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }}>
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="10" y1="11" x2="14" y2="11" />
                    </svg>
                    <span className="text-[12.5px] font-semibold whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>New Chat</span>
                </button>
            </div>

            <div className="px-3 pb-3 flex flex-col gap-1 shrink-0">
                {[
                    { href: "/web-score", label: "Web Score", icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /> },
                    { href: "/research", label: "Research", icon: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></> },
                    { href: "/templates", label: "Templates", icon: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></> },
                ].map(({ href, label, icon }) => {
                    const active = pathname === href;
                    return (
                        <Link key={href} href={href} className={`${NAV_BTN} ${active ? "bg-bubble text-pri font-semibold" : ""}`}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-mut transition-colors duration-150">
                                {icon}
                            </svg>
                            {label}
                        </Link>
                    );
                })}
            </div>

            <div className="mx-4 border-t border-base border-dashed mb-3 shrink-0" />

            <div className="flex-1 overflow-y-auto px-3 flex flex-col gap-1.5 pb-2" style={{ scrollbarWidth: "none" }}>
                <div>
                    <button onClick={() => setStarredOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <span className="dark:text-white text-black opacity-75"><FilledStarIcon /></span>
                            Starred
                        </span>
                        <ChevronIcon open={starredOpen} />
                    </button>
                    {starredOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleStarred.map(item => (
                                <SidebarItem key={item.id} id={item.id} label={item.label} dropdownOptions={STARRED_OPTIONS}
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <button onClick={() => setProjectsOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <span className="dark:text-white text-black opacity-75"><FilledFolderIcon /></span>
                            Projects
                        </span>
                        <ChevronIcon open={projectsOpen} />
                    </button>
                    {projectsOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleProjects.map(item => (
                                <SidebarItem key={item.id} id={item.id} label={item.label} dropdownOptions={PROJECT_OPTIONS}
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <button onClick={() => setChatsOpen(p => !p)} className={SECTION_BTN}>
                        <span className={SECTION_LABEL}>
                            <span className="dark:text-white text-black opacity-75"><FilledChatIcon /></span>
                            Chats
                        </span>
                        <ChevronIcon open={chatsOpen} />
                    </button>
                    {chatsOpen && (
                        <div className="mt-1 flex flex-col gap-0.5 pl-2">
                            {sampleChats.map(item => (
                                <SidebarItem key={item.id} id={item.id} label={item.label} dropdownOptions={CHAT_OPTIONS}
                                    icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="px-3 py-4 shrink-0 border-t border-base">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-tertiary border border-base flex items-center justify-center text-sec text-sm font-bold shrink-0">J</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-pri text-[13px] font-semibold truncate leading-tight">John Doe</p>
                        <p className="text-mut text-[11px] truncate leading-tight">john@example.com</p>
                    </div>
                    <Link href="/settings" title="Settings"
                        className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all duration-150 cursor-pointer shrink-0 ${H_BG2} ${H_BDR} ${pathname === "/settings" ? "text-pri bg-bubble border-em" : "text-mut bg-tertiary border-base"}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </Link>
                    <button title="Log out" className="w-8 h-8 flex items-center justify-center rounded-xl border border-base bg-tertiary text-mut hover:text-red-500 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-150 cursor-pointer shrink-0">
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
