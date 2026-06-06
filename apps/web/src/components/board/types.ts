export type Tool =
    | "select" | "hand" | "pen" | "rect" | "ellipse"
    | "line" | "arrow" | "text" | "sticky" | "frame" | "eraser";

export type ShapeKind =
    | "rect" | "ellipse" | "line" | "arrow"
    | "text" | "sticky" | "frame" | "freehand";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type Point = { x: number; y: number };

export interface Shape {
    id: string;
    kind: ShapeKind;
    x: number;
    y: number;
    w: number;
    h: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
    text?: string;
    points?: Point[];
    fontSize?: number;
    fontWeight?: string;
    rx?: number;
    locked?: boolean;
}

export interface EditPos {
    x: number;
    y: number;
    w: number;
    h: number;
}
