"use client";

import { memo } from "react";
import type { Shape } from "./types";
import { HANDLES } from "./boardConstants";
import { handlePos } from "./boardUtils";

interface Props {
    shapes: Shape[];
    selected: string[];
    zoom: number;
}

export const SelectionOverlay = memo(function SelectionOverlay({ shapes, selected, zoom }: Props) {
    return (
        <>
            {selected.map(id => {
                const s = shapes.find(sh => sh.id === id);
                if (!s || s.kind === "freehand" || s.kind === "line" || s.kind === "arrow") return null;
                return (
                    <g key={`sel-${id}`} style={{ pointerEvents: "none" }}>
                        <rect
                            x={s.x - 2 / zoom} y={s.y - 2 / zoom}
                            width={s.w + 4 / zoom} height={s.h + 4 / zoom}
                            fill="none"
                            stroke="#3B82F6"
                            strokeWidth={1.5 / zoom}
                            strokeDasharray={`${4 / zoom} ${2 / zoom}`}
                            rx={2 / zoom}
                        />
                        {HANDLES.map(h => {
                            const p = handlePos(s, h);
                            return (
                                <rect
                                    key={h}
                                    x={p.x - 4 / zoom} y={p.y - 4 / zoom}
                                    width={8 / zoom} height={8 / zoom}
                                    fill="white"
                                    stroke="#3B82F6"
                                    strokeWidth={1.5 / zoom}
                                    rx={1.5 / zoom}
                                    style={{ pointerEvents: "all", cursor: `${h}-resize` }}
                                />
                            );
                        })}
                    </g>
                );
            })}
        </>
    );
});
