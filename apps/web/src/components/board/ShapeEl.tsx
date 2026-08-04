"use client";

import { memo } from "react";
import type { Shape } from "./types";

interface Props {
    s: Shape;
    selected: boolean;
    onMouseDown: (e: React.MouseEvent, id: string) => void;
    onDoubleClick: (e: React.MouseEvent, id: string) => void;
}

export const ShapeEl = memo(function ShapeEl({ s, selected, onMouseDown, onDoubleClick }: Props) {
    const selFilter = selected
        ? "drop-shadow(0 0 0 2px #3B82F6) drop-shadow(0 0 0 4px rgba(59,130,246,0.3))"
        : undefined;

    const shared = {
        style: { filter: selFilter, opacity: s.opacity },
        onMouseDown: (e: React.MouseEvent) => onMouseDown(e, s.id),
        onDoubleClick: (e: React.MouseEvent) => onDoubleClick(e, s.id),
        className: "cursor-default",
    };

    if (s.kind === "freehand" && s.points && s.points.length > 1) {
        const d = s.points.reduce(
            (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
            ""
        );
        return (
            <path d={d} fill="none" stroke={s.stroke} strokeWidth={s.strokeWidth}
                strokeLinecap="round" strokeLinejoin="round" {...shared} />
        );
    }

    if (s.kind === "rect" || s.kind === "frame") {
        const isFrame = s.kind === "frame";
        return (
            <g {...shared}>
                <rect
                    x={s.x} y={s.y} width={s.w} height={s.h}
                    rx={s.rx ?? (isFrame ? 6 : 4)}
                    fill={isFrame ? "rgba(255,255,255,0.04)" : s.fill}
                    stroke={isFrame ? "#3B82F6" : s.stroke}
                    strokeWidth={isFrame ? 1.5 : s.strokeWidth}
                    strokeDasharray={isFrame ? "4 3" : undefined}
                />
                {isFrame && s.text && (
                    <text x={s.x + 6} y={s.y - 6} fill="#3B82F6" fontSize={11} fontWeight="500">
                        {s.text}
                    </text>
                )}
            </g>
        );
    }

    if (s.kind === "ellipse") {
        return (
            <ellipse
                cx={s.x + s.w / 2} cy={s.y + s.h / 2}
                rx={s.w / 2} ry={s.h / 2}
                fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth}
                {...shared}
            />
        );
    }

    if (s.kind === "line" || s.kind === "arrow") {
        const x2 = s.x + s.w;
        const y2 = s.y + s.h;
        const angle = Math.atan2(y2 - s.y, x2 - s.x);
        const al = 12;
        return (
            <g {...shared}>
                <line x1={s.x} y1={s.y} x2={x2} y2={y2}
                    stroke={s.stroke} strokeWidth={s.strokeWidth} strokeLinecap="round" />
                {s.kind === "arrow" && (
                    <polygon
                        fill={s.stroke}
                        points={[
                            `${x2},${y2}`,
                            `${x2 - al * Math.cos(angle - Math.PI / 6)},${y2 - al * Math.sin(angle - Math.PI / 6)}`,
                            `${x2 - al * Math.cos(angle + Math.PI / 6)},${y2 - al * Math.sin(angle + Math.PI / 6)}`,
                        ].join(" ")}
                    />
                )}
                <line x1={s.x} y1={s.y} x2={x2} y2={y2} stroke="transparent" strokeWidth={16} />
            </g>
        );
    }

    if (s.kind === "sticky") {
        return (
            <g {...shared}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={6}
                    fill={s.fill} stroke="rgba(0,0,0,0.08)" strokeWidth={1}
                    style={{ filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.12))" }}
                />
                <polygon
                    points={`${s.x + s.w - 16},${s.y} ${s.x + s.w},${s.y} ${s.x + s.w},${s.y + 16}`}
                    fill="rgba(0,0,0,0.12)"
                />
                <foreignObject x={s.x + 10} y={s.y + 10} width={s.w - 20} height={s.h - 20}>
                    <div style={{ fontSize: 13, color: "#1a1a1a", wordBreak: "break-word", userSelect: "none", lineHeight: 1.5 }}>
                        {s.text ?? ""}
                    </div>
                </foreignObject>
            </g>
        );
    }

    if (s.kind === "text") {
        return (
            <text
                x={s.x} y={s.y}
                fill={s.fill || s.stroke}
                fontSize={s.fontSize ?? 18}
                fontWeight={s.fontWeight ?? "400"}
                {...shared}
            >
                {s.text || "Text"}
            </text>
        );
    }

    return null;
});
