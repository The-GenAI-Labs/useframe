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
                <div className="w-7 h-7 rounded-full bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                        <path d="M12 2L9 9H2l5.5 4-2 7L12 16l6.5 4-2-7L22 9h-7z" />
                    </svg>
                </div>
            )}

            <div
                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isUser
                        ? "bg-black text-white rounded-tr-sm"
                        : "bg-white border border-black/8 text-black/80 rounded-tl-sm shadow-sm"
                }`}
            >
                {message.content}
                {isStreaming && !isUser && (
                    <span className="inline-flex gap-0.5 ml-1 align-middle">
                        <span className="w-1 h-1 rounded-full bg-black/30 animate-chat-dot" style={{ animationDelay: "0ms" }} />
                        <span className="w-1 h-1 rounded-full bg-black/30 animate-chat-dot" style={{ animationDelay: "150ms" }} />
                        <span className="w-1 h-1 rounded-full bg-black/30 animate-chat-dot" style={{ animationDelay: "300ms" }} />
                    </span>
                )}
            </div>
        </div>
    );
});
