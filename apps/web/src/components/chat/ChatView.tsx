"use client";

import { useCallback, useState } from "react";
import { useChatModalStore } from "@/store/chatModalStore";
import { MessageList } from "./modal/MessageList";
import { ModalChatInput } from "./modal/ModalChatInput";
import { SuggestionChips } from "./modal/SuggestionChips";

function ChatHistoryItem({
    label,
    active,
    onClick,
}: {
    label: string;
    active?: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors cursor-pointer truncate ${
                active
                    ? "bg-black/6 text-black/80 font-medium"
                    : "text-black/45 hover:bg-black/4 hover:text-black/65"
            }`}
        >
            {label}
        </button>
    );
}

const SAMPLE_HISTORY = [
    "Research UI best practices",
    "Improve my design system",
    "Browse my templates",
    "Suggest a page layout",
];

export default function ChatView() {
    const { messages, isStreaming, sendMessage, activeChatId, reset } = useChatModalStore();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const hasMessages = messages.length > 0;

    const handleSend = useCallback(
        (text: string) => {
            sendMessage(text);
        },
        [sendMessage]
    );

    const handleNewChat = useCallback(() => {
        reset();
    }, [reset]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Left history panel — desktop always visible, mobile hidden */}
            <div
                className={`
                    shrink-0 border-r border-black/6 flex flex-col gap-1 overflow-hidden
                    transition-all duration-200
                    ${sidebarOpen ? "w-52" : "w-0"}
                    hidden md:flex
                `}
            >
                <div className="flex items-center justify-between px-3 pt-4 pb-2 shrink-0">
                    <span className="text-[11px] font-semibold text-black/30 uppercase tracking-wider">History</span>
                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="p-1 rounded-lg hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors cursor-pointer"
                        aria-label="New chat"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-0.5" style={{ scrollbarWidth: "none" }}>
                    {hasMessages && activeChatId && (
                        <ChatHistoryItem
                            label={messages[0]?.content.slice(0, 40) || "New conversation"}
                            active
                        />
                    )}
                    {SAMPLE_HISTORY.map((item) => (
                        <ChatHistoryItem key={item} label={item} />
                    ))}
                </div>
            </div>

            {/* Main chat area */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
                {/* Top bar */}
                <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-3 shrink-0 border-b border-black/6">
                    <div className="flex items-center gap-2.5">
                        {/* Mobile: toggle history drawer (future) */}
                        <button
                            type="button"
                            onClick={() => setSidebarOpen((p) => !p)}
                            className="hidden md:flex p-1.5 rounded-lg hover:bg-black/5 text-black/30 hover:text-black/60 transition-colors cursor-pointer"
                            aria-label="Toggle history"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>

                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z" />
                                </svg>
                            </div>
                            <span className="text-[13px] font-semibold text-black/70">
                                {hasMessages ? "UseFrame AI" : "New chat"}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleNewChat}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-black/8 text-[12px] text-black/45 hover:text-black/65 hover:border-black/15 hover:bg-black/3 transition-all cursor-pointer"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New chat
                    </button>
                </div>

                {/* Messages or welcome */}
                {hasMessages ? (
                    <>
                        <MessageList messages={messages} isStreaming={isStreaming} />
                        <div className="px-4 md:px-6 pb-5 pt-3 shrink-0 border-t border-black/6">
                            <div className="max-w-2xl mx-auto">
                                <ModalChatInput onSend={handleSend} placeholder="Reply…" />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
                        <div className="w-full max-w-xl flex flex-col items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                                    <path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z" />
                                </svg>
                            </div>

                            <div className="text-center">
                                <h1 className="text-2xl font-bold text-black/85 tracking-tight">
                                    How can I help?
                                </h1>
                                <p className="text-sm text-black/40 mt-1.5 leading-snug">
                                    Ask me to update your workspace, assign tasks, or automate workflows.
                                </p>
                            </div>

                            <SuggestionChips onSelect={handleSend} />

                            <div className="w-full">
                                <ModalChatInput onSend={handleSend} autoFocus />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
