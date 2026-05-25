"use client";

import { memo, useEffect, useRef } from "react";
import type { Message } from "@/store/chatModalStore";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
    messages: Message[];
    isStreaming: boolean;
}

export const MessageList = memo(function MessageList({ messages, isStreaming }: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ scrollbarWidth: "none" }}>
            {messages.map((msg, i) => (
                <MessageBubble
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"}
                />
            ))}
            <div ref={bottomRef} />
        </div>
    );
});
