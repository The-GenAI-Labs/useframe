"use client";

import { memo } from "react";
import { useChatModalStore } from "@/store/chatModalStore";

interface ChatTriggerProps {
    children: React.ReactNode;
    className?: string;
}

export const ChatTrigger = memo(function ChatTrigger({ children, className }: ChatTriggerProps) {
    const open = useChatModalStore((s) => s.open);
    return (
        <button type="button" onClick={open} className={className}>
            {children}
        </button>
    );
});
