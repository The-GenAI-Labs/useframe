"use client";

import type { ReactElement, ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

export function HintProvider({ children }: { children: ReactNode }) {
    return (
        <TooltipPrimitive.Provider delayDuration={250} skipDelayDuration={150}>
            {children}
        </TooltipPrimitive.Provider>
    );
}

type HintProps = {
    label: ReactNode;
    /** Small pill after the label, e.g. "Coming soon". */
    note?: string;
    /** Keyboard shortcut shown as a key cap, e.g. "Enter". */
    shortcut?: string;
    side?: "top" | "right" | "bottom" | "left";
    /** Must accept a ref and pointer/focus handlers; wrap disabled buttons in a span. */
    children: ReactElement;
};

export function Hint({ label, note, shortcut, side = "top", children }: HintProps) {
    return (
        <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side={side}
                    sideOffset={8}
                    collisionPadding={8}
                    className="hint z-[10000] flex max-w-[260px] items-center gap-2 rounded-xl border border-white/10 bg-slate-900/95 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-white shadow-[0_10px_28px_-8px_rgba(15,23,42,0.5)] backdrop-blur-md"
                >
                    <span>{label}</span>
                    {note && (
                        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10.5px] font-semibold text-indigo-200">
                            {note}
                        </span>
                    )}
                    {shortcut && (
                        <kbd className="shrink-0 rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-sans text-[10.5px] font-semibold text-white/80">
                            {shortcut}
                        </kbd>
                    )}
                    <TooltipPrimitive.Arrow width={10} height={5} className="fill-slate-900/95" />
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}
