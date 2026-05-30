"use client";

import { memo } from "react";
import type { Message } from "@/store/chatModalStore";

interface MessageBubbleProps {
    message: Message;
    isStreaming?: boolean;
}

export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
    const isUser = message.role === "user";

    return (
        <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
            {!isUser && (
                <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-400 to-blue-600 shrink-0 mt-0.5 shadow-sm" />
            )}

            <div
                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed text-pri ${
                    isUser
                        ? "bg-bubble rounded-tr-sm border border-base shadow-sm"
                        : "bg-surface border border-base rounded-tl-sm shadow-sm"
                }`}
            >
                {message.content}
                {isStreaming && !isUser && (
                    <span className="inline-flex gap-0.5 ml-1 align-middle">
                        <span className="w-1 h-1 rounded-full animate-chat-dot" style={{ backgroundColor: "var(--text-secondary)", animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full animate-chat-dot" style={{ backgroundColor: "var(--text-secondary)", animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full animate-chat-dot" style={{ backgroundColor: "var(--text-secondary)", animationDelay: "300ms" }} />
                    </span>
                )}
            </div>
        </div>
    );
});
