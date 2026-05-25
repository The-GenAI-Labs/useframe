"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useChatModalStore } from "@/store/chatModalStore";
import { Backdrop } from "./Backdrop";
import { SuggestionChips } from "./SuggestionChips";
import { ModalChatInput } from "./ModalChatInput";
import { MessageList } from "./MessageList";

export function ChatModal() {
    const { status, messages, isStreaming, sendMessage, close, minimize } =
        useChatModalStore();

    const router = useRouter();
    const dialogRef = useRef<HTMLDivElement>(null);
    const hasMessages = messages.length > 0;

    useEffect(() => {
        if (status !== "open") return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [status, close]);

    useEffect(() => {
        if (status !== "open") return;
        const el = dialogRef.current;
        if (!el) return;

        const focusables = el.querySelectorAll<HTMLElement>(
            'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        const trap = (e: KeyboardEvent) => {
            if (e.key !== "Tab") return;
            if (e.shiftKey) {
                if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
            } else {
                if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
        };

        el.addEventListener("keydown", trap);
        first?.focus();
        return () => el.removeEventListener("keydown", trap);
    }, [status, hasMessages]);

    const handleSend = useCallback(
        (text: string) => {
            sendMessage(text);
        },
        [sendMessage]
    );

    const handleExpand = useCallback(() => {
        close(); // keep messages in store — ChatView reads same store
        router.push("/chat");
    }, [close, router]);

    if (status !== "open") return null;

    return (
        <>
            <Backdrop onClick={close} />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label="AI Assistant"
                className="fixed inset-0 z-9999 flex items-end md:items-center justify-center pointer-events-none md:px-4"
            >
                <div
                    className={`
                        pointer-events-auto bg-white shadow-2xl border border-black/8
                        flex flex-col overflow-hidden
                        transition-all duration-300 ease-out
                        animate-modal-scale-in
                        w-full rounded-t-3xl md:rounded-3xl
                        max-w-full md:max-w-110
                        ${hasMessages ? "h-[92vh] md:h-150" : "h-auto"}
                    `}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z" />
                                </svg>
                            </div>
                            <button
                                type="button"
                                className="flex items-center gap-1 text-[13px] font-semibold text-black/80 hover:text-black transition-colors cursor-pointer"
                            >
                                New chat
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="p-1.5 rounded-lg text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors cursor-pointer"
                                aria-label="Settings"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                    <line x1="4" y1="6" x2="20" y2="6" />
                                    <line x1="8" y1="12" x2="20" y2="12" />
                                    <line x1="4" y1="18" x2="20" y2="18" />
                                    <circle cx="6" cy="6" r="2" fill="currentColor" stroke="none" />
                                    <circle cx="10" cy="12" r="2" fill="currentColor" stroke="none" />
                                    <circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={handleExpand}
                                className="p-1.5 rounded-lg text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors cursor-pointer"
                                aria-label="Open in full page"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                    <polyline points="15 3 21 3 21 9" />
                                    <polyline points="9 21 3 21 3 15" />
                                    <line x1="21" y1="3" x2="14" y2="10" />
                                    <line x1="3" y1="21" x2="10" y2="14" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={minimize}
                                className="p-1.5 rounded-lg text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors cursor-pointer"
                                aria-label="Minimize chat"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </button>

                            <button
                                type="button"
                                onClick={close}
                                className="p-1.5 rounded-lg text-black/30 hover:text-black/60 hover:bg-black/5 transition-colors cursor-pointer"
                                aria-label="Close chat"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="h-px bg-black/6 mx-4 shrink-0" />

                    {hasMessages ? (
                        <>
                            <MessageList messages={messages} isStreaming={isStreaming} />
                            <div className="px-4 pb-4 pt-2 shrink-0 border-t border-black/6 flex flex-col gap-2">
                                <ModalChatInput onSend={handleSend} placeholder="Reply…" />
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-4 px-4 pt-5 pb-5 md:gap-5 md:px-5 md:pt-6">
                            <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z" />
                                </svg>
                            </div>

                            <div className="text-center">
                                <h2 className="text-[22px] font-bold text-black/85 tracking-tight leading-tight">
                                    How can I help?
                                </h2>
                                <p className="text-sm text-black/40 mt-1 leading-snug">
                                    Ask me to update your workspace, assign<br />tasks, or automate workflows.
                                </p>
                            </div>

                            <SuggestionChips onSelect={handleSend} />

                            <div className="w-full flex flex-col gap-2.5">
                                <ModalChatInput onSend={handleSend} autoFocus />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
