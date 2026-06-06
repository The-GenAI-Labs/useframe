"use client";

import { memo, useCallback } from "react";
import type { Tool } from "./types";
import { TOOLS, STICKY_COLORS } from "./boardConstants";

const TOOL_ICONS: Record<Tool, React.ReactNode> = {
    select:  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 2l16 10-7 1-3 7z"/></svg>,
    hand:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>,
    pen:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>,
    rect:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
    ellipse: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="12" rx="10" ry="7"/></svg>,
    line:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="21" x2="21" y2="3"/></svg>,
    arrow:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9 5 19 5 19 15"/></svg>,
    text:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>,
    sticky:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><polyline points="15 3 15 9 21 9"/></svg>,
    frame:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>,
    eraser:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/><path d="M6.0 11.0 l7 7"/></svg>,
};

interface Props {
    tool: Tool;
    stickyColor: string;
    onSelectTool: (t: Tool) => void;
    onSelectSticky: (color: string) => void;
}

export const ToolPalette = memo(function ToolPalette({ tool, stickyColor, onSelectTool, onSelectSticky }: Props) {
    const handleSticky = useCallback((c: string) => {
        onSelectSticky(c);
        onSelectTool("sticky");
    }, [onSelectTool, onSelectSticky]);

    return (
        <div
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-0.5 p-1.5 rounded-2xl shadow-lg"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
            {TOOLS.map(t => (
                <button
                    key={t.id}
                    onClick={() => onSelectTool(t.id)}
                    title={t.label}
                    className="w-8 h-8 flex items-center justify-center rounded-xl transition-all cursor-pointer"
                    style={{
                        backgroundColor: tool === t.id ? "var(--bg-bubble)" : "transparent",
                        color: tool === t.id ? "var(--text-primary)" : "var(--text-muted)",
                        boxShadow: tool === t.id ? "inset 0 1px 2px rgba(0,0,0,0.08)" : undefined,
                    }}
                    onMouseEnter={e => { if (tool !== t.id) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"; }}
                    onMouseLeave={e => { if (tool !== t.id) (e.currentTarget as HTMLElement).style.backgroundColor = ""; }}
                >
                    {TOOL_ICONS[t.id]}
                </button>
            ))}

            <div className="w-full h-px my-0.5" style={{ backgroundColor: "var(--border)" }} />

            {STICKY_COLORS.map(c => (
                <button
                    key={c}
                    onClick={() => handleSticky(c)}
                    title={`Sticky ${c}`}
                    className="w-8 h-8 flex items-center justify-center rounded-xl cursor-pointer transition-all"
                    style={{ backgroundColor: stickyColor === c && tool === "sticky" ? "var(--bg-bubble)" : "transparent" }}
                >
                    <div className="w-4 h-4 rounded-sm border border-black/10" style={{ backgroundColor: c }} />
                </button>
            ))}
        </div>
    );
});
