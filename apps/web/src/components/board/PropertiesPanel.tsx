"use client";

import { memo, useCallback } from "react";
import type { Shape } from "./types";
import { uid } from "./boardConstants";
import { ColorPanel } from "./ColorPanel";

interface Props {
    selShape: Shape;
    shapes: Shape[];
    selected: string[];
    onApply: (patch: Partial<Shape>) => void;
    onDelete: () => void;
    onDuplicate: (clone: Shape) => void;
}

export const PropertiesPanel = memo(function PropertiesPanel({
    selShape, shapes, selected, onApply, onDelete, onDuplicate,
}: Props) {
    const handleDuplicate = useCallback(() => {
        const clone: Shape = { ...selShape, id: uid(), x: selShape.x + 20, y: selShape.y + 20 };
        onDuplicate(clone);
    }, [selShape, onDuplicate]);

    return (
        <div
            className="absolute right-3 top-3 bottom-3 w-52 rounded-2xl overflow-y-auto shadow-lg p-3 flex flex-col gap-3"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)", scrollbarWidth: "none" }}
        >
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Properties
            </p>

            <div className="grid grid-cols-2 gap-1.5">
                {(["x", "y", "w", "h"] as const).map(key => (
                    <div key={key} className="flex flex-col gap-0.5">
                        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {key.toUpperCase()}
                        </span>
                        <input
                            type="number"
                            value={Math.round(selShape[key])}
                            onChange={e => onApply({ [key]: Number(e.target.value) })}
                            className="w-full text-[11px] px-2 py-1 rounded-lg border outline-none"
                            style={{ backgroundColor: "var(--bg-tertiary)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                    </div>
                ))}
            </div>

            <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

            <ColorPanel
                fill={selShape.fill}
                stroke={selShape.stroke}
                onFill={c => onApply({ fill: c })}
                onStroke={c => onApply({ stroke: c })}
                strokeWidth={selShape.strokeWidth}
                onStrokeWidth={n => onApply({ strokeWidth: n })}
                opacity={selShape.opacity}
                onOpacity={n => onApply({ opacity: n })}
                fontSize={selShape.fontSize ?? 18}
                onFontSize={n => onApply({ fontSize: n })}
            />

            <div className="h-px" style={{ backgroundColor: "var(--border)" }} />

            <div className="flex flex-col gap-1">
                <button
                    onClick={onDelete}
                    className="w-full py-1.5 rounded-lg text-[11px] font-medium text-red-500 transition-colors cursor-pointer"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.08)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"}
                >
                    Delete
                </button>
                <button
                    onClick={handleDuplicate}
                    className="w-full py-1.5 rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                    style={{ backgroundColor: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-bubble)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-tertiary)"}
                >
                    Duplicate
                </button>
            </div>
        </div>
    );
});
