"use client";

import { forwardRef, memo } from "react";
import type { Shape, Tool, Point } from "./types";
import { GRID_SIZE } from "./boardConstants";
import { ShapeEl } from "./ShapeEl";
import { SelectionOverlay } from "./SelectionOverlay";

interface Props {
    shapes: Shape[];
    selected: string[];
    zoom: number;
    pan: Point;
    tool: Tool;
    showGrid: boolean;
    darkCanvas: boolean;
    cursor: string;
    onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
    onMouseUp: () => void;
    onWheel: (e: React.WheelEvent) => void;
    onShapeMouseDown: (e: React.MouseEvent, id: string) => void;
    onShapeDblClick: (e: React.MouseEvent, id: string) => void;
}

export const BoardCanvas = memo(forwardRef<SVGSVGElement, Props>(function BoardCanvas(
    {
        shapes, selected, zoom, pan, showGrid, darkCanvas, cursor,
        onMouseDown, onMouseMove, onMouseUp, onWheel,
        onShapeMouseDown, onShapeDblClick,
    },
    ref
) {
    const canvasBg = darkCanvas ? "#111110" : "#F5F4EF";
    const gridColor = darkCanvas ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
    const smallW = GRID_SIZE * zoom;
    const bigW = smallW * 5;
    const px = pan.x % smallW;
    const py = pan.y % smallW;
    const bx = pan.x % bigW;
    const by = pan.y % bigW;

    return (
        <svg
            ref={ref}
            className="flex-1 h-full touch-none"
            style={{ cursor, backgroundColor: canvasBg }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onWheel={onWheel}
        >
            <defs>
                {showGrid && (
                    <pattern id="sg" width={smallW} height={smallW} patternUnits="userSpaceOnUse" x={px} y={py}>
                        <path d={`M ${smallW} 0 L 0 0 0 ${smallW}`} fill="none" stroke={gridColor} strokeWidth="0.5" />
                    </pattern>
                )}
                {showGrid && (
                    <pattern id="bg" width={bigW} height={bigW} patternUnits="userSpaceOnUse" x={bx} y={by}>
                        <rect width={bigW} height={bigW} fill="url(#sg)" />
                        <path d={`M ${bigW} 0 L 0 0 0 ${bigW}`} fill="none" stroke={gridColor} strokeWidth="1" />
                    </pattern>
                )}
            </defs>

            {showGrid && <rect width="100%" height="100%" fill="url(#bg)" />}

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {shapes.map(s => (
                    <ShapeEl
                        key={s.id}
                        s={s}
                        selected={selected.includes(s.id)}
                        onMouseDown={onShapeMouseDown}
                        onDoubleClick={onShapeDblClick}
                    />
                ))}
                <SelectionOverlay shapes={shapes} selected={selected} zoom={zoom} />
            </g>
        </svg>
    );
}));
