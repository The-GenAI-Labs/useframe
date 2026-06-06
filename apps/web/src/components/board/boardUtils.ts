import type { Shape, Handle, Point } from "./types";

export function normalizeRect(x1: number, y1: number, x2: number, y2: number) {
    return {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.abs(x2 - x1),
        h: Math.abs(y2 - y1),
    };
}

export function ptInShape(s: Shape, cx: number, cy: number): boolean {
    if (s.kind === "line" || s.kind === "arrow") {
        const tol = 8;
        return cx >= s.x - tol && cx <= s.x + s.w + tol
            && cy >= s.y - tol && cy <= s.y + s.h + tol;
    }
    return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h;
}

export function handlePos(s: Shape, h: Handle): Point {
    const mx = s.x + s.w / 2;
    const my = s.y + s.h / 2;
    const ex = s.x + s.w;
    const ey = s.y + s.h;
    const map: Record<Handle, Point> = {
        nw: { x: s.x, y: s.y }, n: { x: mx, y: s.y }, ne: { x: ex, y: s.y },
        e:  { x: ex, y: my  }, se: { x: ex, y: ey  }, s:  { x: mx, y: ey  },
        sw: { x: s.x, y: ey }, w:  { x: s.x, y: my  },
    };
    return map[h];
}
