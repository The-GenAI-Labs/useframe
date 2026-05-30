"use client";

import { memo } from "react";
import { useChatModalStore } from "@/store/chatModalStore";

export const MinimizedPill = memo(function MinimizedPill() {
    const { status, restore, messages } = useChatModalStore();

    if (status !== "minimized") return null;

    const lastMsg = messages[messages.length - 1];
    const preview = lastMsg
        ? lastMsg.content.slice(0, 32) + (lastMsg.content.length > 32 ? "…" : "")
        : "New chat";

    return (
        <>
            <style>{`
                @property --pill-angle {
                    syntax: "<angle>";
                    initial-value: 0deg;
                    inherits: false;
                }
                @keyframes pill-spin {
                    to { --pill-angle: 360deg; }
                }
                .pill-flow-border {
                    position: relative;
                    border-radius: 1rem;
                    background: var(--bg-primary);
                }
                .pill-flow-border::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    padding: 4px; /* border thickness, was border-4 */
                    background: conic-gradient(
                        from var(--pill-angle),
                        #66A8FF 0deg,
                        #fff 90deg,
                        #66A8FF 180deg,
                        #fff 270deg,
                        #66A8FF 360deg
                    );
                    /* mask so the gradient only shows in the border ring */
                    -webkit-mask:
                        linear-gradient(#fff 0 0) content-box,
                        linear-gradient(#fff 0 0);
                    -webkit-mask-composite: xor;
                    mask:
                        linear-gradient(#fff 0 0) content-box,
                        linear-gradient(#fff 0 0);
                    mask-composite: exclude;
                    animation: pill-spin 6s linear infinite;
                    pointer-events: none;
                }
                @media (prefers-reduced-motion: reduce) {
                    .pill-flow-border::before { animation: none; }
                }
            `}</style>

            <button
                type="button"
                onClick={restore}
                aria-label="Restore chat"
                className="pill-flow-border fixed bottom-16 right-1 z-9999 flex items-center gap-2.5 pl-6 pr-6 py-4 m-5 shadow-2xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer group"
            >
                <div className="flex flex-col items-start min-w-0">
                    <span className="text-[10px] text-pri leading-tight truncate max-w-35">
                        {preview}
                    </span>
                </div>

                {messages.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 animate-pulse" />
                )}
            </button>
        </>
    );
});