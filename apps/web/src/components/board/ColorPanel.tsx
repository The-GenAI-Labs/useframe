"use client";

import { useState, memo } from "react";
import { PALETTE } from "./boardConstants";

interface Props {
    fill: string;
    stroke: string;
    onFill: (c: string) => void;
    onStroke: (c: string) => void;
    strokeWidth: number;
    onStrokeWidth: (n: number) => void;
    opacity: number;
    onOpacity: (n: number) => void;
    fontSize: number;
    onFontSize: (n: number) => void;
}

export const ColorPanel = memo(function ColorPanel({
    fill, stroke, onFill, onStroke,
    strokeWidth, onStrokeWidth,
    opacity, onOpacity,
    fontSize, onFontSize,
}: Props) {
    const [tab, setTab] = useState<"fill" | "stroke">("fill");
    const active = tab === "fill" ? fill : stroke;
    const onActive = tab === "fill" ? onFill : onStroke;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                {(["fill", "stroke"] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className="flex-1 py-1 rounded-md text-[11px] font-semibold capitalize transition-colors cursor-pointer"
                        style={{
                            backgroundColor: tab === t ? "var(--bg-primary)" : "transparent",
                            color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                        }}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
                {PALETTE.map(c => (
                    <button
                        key={c}
                        onClick={() => onActive(c)}
                        className="w-7 h-7 rounded-md border-2 cursor-pointer transition-transform hover:scale-110"
                        style={{ backgroundColor: c, borderColor: active === c ? "#3B82F6" : "transparent" }}
                    />
                ))}
            </div>

            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md border border-base shrink-0" style={{ backgroundColor: active }} />
                <input
                    type="text"
                    maxLength={7}
                    value={active}
                    onChange={e => onActive(e.target.value)}
                    className="flex-1 text-[11px] px-2 py-1 rounded-md border outline-none font-mono"
                    style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
            </div>

            <div className="flex flex-col gap-2 pt-1 border-t" style={{ borderColor: "var(--border)" }}>
                {[
                    { label: "Stroke W", value: strokeWidth,         min: 0.5, max: 16,  step: 0.5, fmt: (v: number) => String(v),              onChange: onStrokeWidth },
                    { label: "Opacity",  value: opacity,             min: 0.1, max: 1,   step: 0.05, fmt: (v: number) => `${Math.round(v * 100)}%`, onChange: onOpacity },
                    { label: "Font size",value: fontSize,            min: 8,   max: 96,  step: 1,   fmt: (v: number) => String(v),              onChange: onFontSize },
                ].map(row => (
                    <div key={row.label} className="flex items-center gap-2">
                        <span className="text-[11px] w-14 shrink-0" style={{ color: "var(--text-muted)" }}>{row.label}</span>
                        <input
                            type="range"
                            min={row.min} max={row.max} step={row.step}
                            value={row.value}
                            onChange={e => row.onChange(Number(e.target.value))}
                            className="flex-1 cursor-pointer h-1 accent-blue-500"
                        />
                        <span className="text-[11px] w-8 text-right" style={{ color: "var(--text-secondary)" }}>
                            {row.fmt(row.value)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
});
