"use client";

import { memo } from "react";
import type { Message } from "@/store/chatModalStore";
import { PdfAttachment } from "@/components/chat/PdfAttachment";

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
                className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    message.isError
                        ? "bg-red-50 border border-red-200 text-red-600 rounded-tl-sm dark:bg-red-950/30 dark:border-red-900 dark:text-red-400"
                        : isUser
                            ? "bg-bubble rounded-tr-sm border border-base shadow-sm text-pri"
                            : "bg-surface border border-base rounded-tl-sm shadow-sm text-pri"
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
                {message.producedVersion && (
                    <div className="mt-1.5 pt-1.5 border-t border-base/60">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500">
                            → created v{message.producedVersion.versionNumber}
                        </span>
                    </div>
                )}
                {message.attachments?.map((a) => (
                    <PdfAttachment key={a.documentId} {...a} />
                ))}
            </div>
        </div>
    );
});
