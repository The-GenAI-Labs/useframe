import type { FiveCornerParams, Corner } from "./types";
import { convexCorner, concaveCorner, fmt, type Pt } from "./smoothCorner";

// CardFive
// ────────
// An outer rounded rectangle whose ONE inner-bottom corner is replaced by a
// smooth CONCAVE quarter-cut, so a circular badge nestles into the seam (this is
// the left card in the reference). Walking clockwise from the top-left:
//
//   TL ─(top edge)─ TR ─(right edge)─ [notch corner replaced by concave hug] ─
//   ─ remaining corners ─ back to TL
//
// Every coordinate derives from width/height; nothing is hardcoded to a size.

const unit = {
  right: { x: 1, y: 0 } as Pt,
  left: { x: -1, y: 0 } as Pt,
  down: { x: 0, y: 1 } as Pt,
  up: { x: 0, y: -1 } as Pt,
};

export function generateFiveCornerPath(params: FiveCornerParams): string {
  const { width: w, height: h, smoothing = 0.85, notchCorner = "BR" } = params;
  const r = params.radius ?? 28;
  const rTL = params.radiusTL ?? r;
  const rTR = params.radiusTR ?? r;
  const rBR = params.radiusBR ?? r;
  const rBL = params.radiusBL ?? r;
  const notch = params.notchDepth ?? Math.min(w, h) * 0.22;

  // Corner anchor points (theoretical sharp corners).
  const TL: Pt = { x: 0, y: 0 };
  const TR: Pt = { x: w, y: 0 };
  const BR: Pt = { x: w, y: h };
  const BL: Pt = { x: 0, y: h };

  // For each of the four corners decide convex-rounded vs concave-notched.
  // The notch corner uses `concaveCorner` with the larger `notch` radius.
  const seg: string[] = [];

  // Helper builds one corner given its anchor + the edge dirs (clockwise walk).
  const build = (
    c: Corner,
    anchor: Pt,
    inDir: Pt,
    outDir: Pt,
    convexR: number,
  ) => {
    const isNotch = c === notchCorner;
    const fn = isNotch ? concaveCorner : convexCorner;
    const radius = isNotch ? notch : convexR;
    return fn(anchor, radius, smoothing, inDir, outDir);
  };

  // Clockwise: start on top edge just after TL, go TR, BR, BL, back.
  const cTL = build("TL", TL, unit.up, unit.right, rTL); // arrives up-edge, leaves right
  const cTR = build("TR", TR, unit.right, unit.down, rTR);
  const cBR = build("BR", BR, unit.down, unit.left, rBR);
  const cBL = build("BL", BL, unit.left, unit.up, rBL);

  // Move to the start of the TL corner (on the left edge, heading up into TL).
  seg.push(`M ${fmt(cTL.start.x)} ${fmt(cTL.start.y)}`);
  seg.push(cTL.cmd);
  // line along top edge to TR start
  seg.push(`L ${fmt(cTR.start.x)} ${fmt(cTR.start.y)}`);
  seg.push(cTR.cmd);
  // right edge down to BR start
  seg.push(`L ${fmt(cBR.start.x)} ${fmt(cBR.start.y)}`);
  seg.push(cBR.cmd);
  // bottom edge to BL start
  seg.push(`L ${fmt(cBL.start.x)} ${fmt(cBL.start.y)}`);
  seg.push(cBL.cmd);
  seg.push("Z");

  return seg.join(" ");
}
