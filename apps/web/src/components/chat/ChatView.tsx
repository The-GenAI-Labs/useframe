"use client";

import { useCallback } from "react";
import { useChatModalStore } from "@/store/chatModalStore";
import { MessageList } from "./modal/MessageList";
import { ModalChatInput } from "./modal/ModalChatInput";
import { SuggestionChips } from "./modal/SuggestionChips";

export default function ChatView() {
    const { messages, isStreaming, sendMessage, reset } = useChatModalStore();
    const hasMessages = messages.length > 0;

    const handleSend = useCallback((text: string) => sendMessage(text), [sendMessage]);
    const handleNewChat = useCallback(() => reset(), [reset]);

    return (
        <div className="flex flex-col h-full w-full overflow-hidden">
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 pt-4 pb-3 shrink-0 border-b border-base">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-linear-to-br from-blue-400 to-blue-600 shadow-sm" />
                    <span className="text-[13px] font-semibold text-sec">
                        {hasMessages ? "UseFrame AI" : "New chat"}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-base text-[12px] text-sec hover:text-pri hover:border-em hover:bg-tertiary transition-all cursor-pointer"
                >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New chat
                </button>
            </div>

            {hasMessages ? (
                <>
                    <MessageList messages={messages} isStreaming={isStreaming} />
                    <div className="px-6 pb-5 pt-3 shrink-0 border-t border-base">
                        <div className="max-w-2xl mx-auto">
                            <ModalChatInput onSend={handleSend} placeholder="Reply…" />
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
                    <div className="w-full max-w-xl flex flex-col items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-blue-400 to-blue-600 shadow-lg" />
                        <div className="text-center">
                            <h1 className="text-2xl font-bold text-pri tracking-tight">How can I help?</h1>
                            <p className="text-sm text-mut mt-1.5 leading-snug">
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
    );
}
