"use client";

import { useState, useRef, useEffect, useCallback, memo } from "react";
import { useRouter } from "next/navigation";
import { useSearchModalStore } from "@/store/searchModalStore";

const sampleChats = [
    { id: 1, label: "Product Design Request" },
    { id: 2, label: "Indexes in PostgreSQL" },
    { id: 3, label: "User table best practices" },
    { id: 4, label: "Polling with Node.js" },
];

export const SearchModal = memo(function SearchModal() {
    const { isOpen, close } = useSearchModalStore();
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const router = useRouter();

    const filtered = query.trim()
        ? sampleChats.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
        : sampleChats;

    useEffect(() => {
        if (!isOpen) { setQuery(""); return; }
        // small delay so the element is mounted before focusing
        const t = setTimeout(() => inputRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isOpen, close]);

    const handleSelect = useCallback((_id: number) => {
        close();
        router.push("/chat");
    }, [close, router]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-sm"
                onClick={close}
                aria-hidden="true"
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 pointer-events-none">
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Search chats"
                    className="pointer-events-auto w-full max-w-lg rounded-2xl overflow-hidden"
                    style={{
                        backgroundColor: "color-mix(in srgb, var(--bg-primary) 92%, transparent)",
                        backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        border: "1px solid var(--border)",
                        boxShadow: "0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.12)",
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Input row */}
                    <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: "var(--border)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }}>
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search chats..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            className="flex-1 bg-transparent text-[14px] outline-none"
                            style={{ color: "var(--text-primary)" }}
                        />
                        <button
                            onClick={close}
                            className="w-6 h-6 flex items-center justify-center rounded-md cursor-pointer transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>

                    {/* New chat shortcut */}
                    <div className="px-2 pt-2">
                        <button
                            onClick={close}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer"
                            style={{ color: "var(--text-secondary)" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                        >
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }}>
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                            </span>
                            New chat
                        </button>
                    </div>

                    {/* Results */}
                    <div className="px-2 pb-2 max-h-72 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                        {filtered.length > 0 && (
                            <>
                                <p className="px-3 pt-3 pb-1.5 text-[10.5px] font-semibold tracking-widest uppercase" style={{ color: "var(--text-muted)" }}>
                                    {query ? "Results" : "Recent"}
                                </p>
                                {filtered.map(chat => (
                                    <button
                                        key={chat.id}
                                        onClick={() => handleSelect(chat.id)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors cursor-pointer text-left"
                                        style={{ color: "var(--text-secondary)" }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                                    >
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" style={{ color: "var(--text-muted)" }}>
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                        </svg>
                                        <span className="truncate">{chat.label}</span>
                                    </button>
                                ))}
                            </>
                        )}
                        {query && filtered.length === 0 && (
                            <p className="px-3 py-6 text-[13px] text-center" style={{ color: "var(--text-muted)" }}>
                                No chats found for &ldquo;{query}&rdquo;
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
});
