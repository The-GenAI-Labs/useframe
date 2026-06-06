"use client";

import { memo } from "react";
import type { Tool } from "./types";
import { MIN_ZOOM, MAX_ZOOM, TOOLS } from "./boardConstants";

interface Props {
    zoom: number;
    showGrid: boolean;
    darkCanvas: boolean;
    shapeCount: number;
    selectedCount: number;
    canUndo: boolean;
    canRedo: boolean;
    activeTool: Tool;
    onZoom: (z: number) => void;
    onToggleGrid: () => void;
    onToggleDark: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onClear: () => void;
}

function IconBtn({ onClick, disabled, children, title }: {
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
    title?: string;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={title}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = ""}
        >
            {children}
        </button>
    );
}

function TextBtn({ onClick, children, active }: {
    onClick: () => void;
    children: React.ReactNode;
    active?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
            style={{
                backgroundColor: active ? "var(--bg-tertiary)" : "transparent",
                color: "var(--text-secondary)",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = active ? "var(--bg-tertiary)" : ""}
        >
            {children}
        </button>
    );
}

export const BoardTopBar = memo(function BoardTopBar({
    zoom, showGrid, darkCanvas, shapeCount, selectedCount,
    canUndo, canRedo, activeTool,
    onZoom, onToggleGrid, onToggleDark, onUndo, onRedo, onClear,
}: Props) {
    const toolLabel = TOOLS.find(t => t.id === activeTool)?.label ?? "";

    return (
        <div
            className="flex items-center justify-between px-4 h-11 shrink-0 border-b"
            style={{ backgroundColor: "var(--bg-primary)", borderColor: "var(--border)" }}
        >
            <div className="flex items-center gap-2.5">
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    Untitled Board
                </span>
            </div>

            <div className="flex items-center gap-1.5">
                <IconBtn onClick={() => onZoom(Math.max(MIN_ZOOM, zoom / 1.2))}>−</IconBtn>
                <button
                    onClick={() => onZoom(1)}
                    className="min-w-14 h-7 px-2 rounded-lg text-[11px] font-semibold tabular-nums transition-colors cursor-pointer"
                    style={{ color: "var(--text-secondary)", backgroundColor: "var(--bg-tertiary)" }}
                >
                    {Math.round(zoom * 100)}%
                </button>
                <IconBtn onClick={() => onZoom(Math.min(MAX_ZOOM, zoom * 1.2))}>+</IconBtn>

                <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--border)" }} />

                <TextBtn onClick={onToggleGrid} active={showGrid}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7"/>
                        <rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/>
                    </svg>
                    Grid
                </TextBtn>

                <TextBtn onClick={onToggleDark} active={darkCanvas}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                    Dark
                </TextBtn>
            </div>

            <div className="flex items-center gap-1.5">
                <span className="text-[11px] mr-1" style={{ color: "var(--text-muted)" }}>
                    {shapeCount} objects
                </span>

                <IconBtn onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 7v6h6"/><path d="M3 13c.9-4.97 5.03-8 9-8a9 9 0 0 1 0 18 9 9 0 0 1-8-5"/>
                    </svg>
                </IconBtn>

                <IconBtn onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 7v6h-6"/><path d="M21 13c-.9-4.97-5.03-8-9-8a9 9 0 0 0 0 18 9 9 0 0 0 8-5"/>
                    </svg>
                </IconBtn>

                <TextBtn onClick={onClear}>Clear</TextBtn>
            </div>
        </div>
    );
});
