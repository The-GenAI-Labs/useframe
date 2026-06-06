import type { Tool } from "./types";

export const GRID_SIZE = 20;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;

export const PALETTE = [
    "#EF4444", "#F97316", "#EAB308", "#22C55E", "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
    "#F87171", "#FCA5A5", "#FED7AA", "#FEF08A", "#BBF7D0", "#A5F3FC", "#BFDBFE", "#DDD6FE",
    "#1A1915", "#6B6860", "#9B9890", "#FFFFFF",
];

export const STICKY_COLORS = ["#FEF08A", "#BBF7D0", "#BFDBFE", "#FCA5A5", "#DDD6FE", "#FED7AA"];

export const uid = () => `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const CURSOR_MAP: Record<Tool, string> = {
    select: "default",
    hand: "grab",
    pen: "crosshair",
    rect: "crosshair",
    ellipse: "crosshair",
    line: "crosshair",
    arrow: "crosshair",
    text: "text",
    sticky: "crosshair",
    frame: "crosshair",
    eraser: "cell",
};

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

export const TOOLS: { id: Tool; label: string; key: string }[] = [
    { id: "select",  key: "v", label: "Select (V)"  },
    { id: "hand",    key: "h", label: "Hand (H)"    },
    { id: "pen",     key: "p", label: "Pen (P)"     },
    { id: "rect",    key: "r", label: "Rect (R)"    },
    { id: "ellipse", key: "e", label: "Ellipse (E)" },
    { id: "line",    key: "l", label: "Line (L)"    },
    { id: "arrow",   key: "a", label: "Arrow (A)"   },
    { id: "text",    key: "t", label: "Text (T)"    },
    { id: "sticky",  key: "s", label: "Sticky (S)"  },
    { id: "frame",   key: "f", label: "Frame (F)"   },
    { id: "eraser",  key: "x", label: "Eraser (X)"  },
];
