"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/authContext";
import { useChatModalStore } from "@/store/chatModalStore";
import { serif } from "@/components/home/fonts";
import { CrossLineBackground } from "@/components/web-score/CrossLineBackground";
import { RobotMascot } from "./RobotMascot";
import { MessageList } from "./modal/MessageList";
import { ModalChatInput } from "./modal/ModalChatInput";

export default function ChatView() {
    const { messages, isStreaming, sendMessage, reset } = useChatModalStore();
    const { user } = useAuth();
    const userName = user?.name ?? "there";
    const hasMessages = messages.length > 0;

    const handleSend = useCallback((text: string) => sendMessage(text), [sendMessage]);
    const handleNewChat = useCallback(() => reset(), [reset]);

    return (
        <div className="relative flex flex-col h-full w-full overflow-hidden">
            <CrossLineBackground />
            <div className="relative flex items-center justify-between px-6 pt-4 pb-3 shrink-0">
                <div className="flex items-center gap-2">
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
                    <div className="relative flex-1 min-h-0 flex flex-col">
                        <MessageList messages={messages} isStreaming={isStreaming} />
                    </div>
                    <div className="relative px-6 pb-5 pt-3 shrink-0 border-t border-base">
                        <div className="max-w-2xl mx-auto">
                            <ModalChatInput onSend={handleSend} placeholder="Reply…" />
                        </div>
                    </div>
                </>
            ) : (
                <div className="relative flex-1 flex flex-col items-center justify-center px-4 pb-8">
                    <div className="w-full max-w-xl flex flex-col items-center gap-8">
                        <div className="relative flex items-center justify-center">
                            <div className="hidden sm:block absolute -top-3 -left-16 rotate-[-4deg]">
                                <div className="px-3 py-1.5 rounded-2xl border border-base shadow-sm text-[11px] text-sec" style={{ backgroundColor: "var(--bg-bubble)" }}>
                                    Hey there! 👋
                                </div>
                            </div>
                            <div className="hidden sm:block absolute top-6 -right-20 rotate-[3deg]">
                                <div className="px-3 py-1.5 rounded-2xl border border-base shadow-sm text-[11px] text-sec" style={{ backgroundColor: "var(--bg-bubble)" }}>
                                    Need a boost?
                                </div>
                            </div>
                            <RobotMascot />
                        </div>

                        <div className="text-center">
                            <h1 className={`${serif.className} text-3xl sm:text-4xl tracking-tight`} style={{ color: "var(--text-primary)" }}>
                                Hi {userName}
                            </h1>
                            <h1 className={`${serif.className} text-3xl sm:text-4xl tracking-tight`} style={{ color: "var(--text-primary)" }}>
                                Ready to Achieve Great Things?
                            </h1>
                        </div>

                        <div className="w-full flex flex-col gap-2.5">
                            <div className="flex items-center justify-between px-4 py-2 rounded-2xl border border-base" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                                <span className="text-[12px] text-sec font-medium">Unlock more with Pro Plan</span>
                                <button
                                    type="button"
                                    title="Coming soon"
                                    className="px-3 py-1 rounded-full text-[11px] font-semibold text-white bg-linear-to-br from-blue-500 to-blue-600 cursor-default"
                                >
                                    Upgrade Now
                                </button>
                            </div>
                            <ModalChatInput
                                onSend={handleSend}
                                autoFocus
                                placeholder="Initiate a query or send a command to the AI…"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
