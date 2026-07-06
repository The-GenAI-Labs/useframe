import type { SevenCornerParams } from "./types";
import { convexCorner, fmt, lerp, type Pt } from "./smoothCorner";

// CardSeven
// ─────────
// Outer rounded rectangle whose inner-bottom corner is replaced by a WIDER notch
// with two smooth transitions and a curved hug region between them — the right
// card in the reference (bottom-right corner stays, the badge tucks into the
// bottom-left seam). This yields the "7 corners" silhouette:
//
//   TL · TR · BR · [transition-in · concave hug · transition-out] · (BL kept) · TL
//
// All coordinates are relative to width/height.

const unit = {
  right: { x: 1, y: 0 } as Pt,
  left: { x: -1, y: 0 } as Pt,
  down: { x: 0, y: 1 } as Pt,
  up: { x: 0, y: -1 } as Pt,
};

export function generateSevenCornerPath(params: SevenCornerParams): string {
  const { width: w, height: h, smoothing = 0.9, notchCorner = "BL" } = params;
  const r = params.radius ?? 28;
  const rTL = params.radiusTL ?? r;
  const rTR = params.radiusTR ?? r;
  const rBR = params.radiusBR ?? r;
  const rBL = params.radiusBL ?? r;

  const notchDepth = params.notchDepth ?? Math.min(w, h) * 0.26; // hug radius
  const notchWidth = params.notchWidth ?? notchDepth * 1.6; // flat span across the well

  const TL: Pt = { x: 0, y: 0 };
  const TR: Pt = { x: w, y: 0 };
  const BR: Pt = { x: w, y: h };
  const BL: Pt = { x: 0, y: h };

  // Convex corners.
  const cTL = convexCorner(TL, rTL, smoothing, unit.up, unit.right);
  const cTR = convexCorner(TR, rTR, smoothing, unit.right, unit.down);
  const cBR = convexCorner(BR, rBR, smoothing, unit.down, unit.left);
  const cBL = convexCorner(BL, rBL, smoothing, unit.left, unit.up);

  const seg: string[] = [];
  seg.push(`M ${fmt(cTL.start.x)} ${fmt(cTL.start.y)}`);
  seg.push(cTL.cmd);
  seg.push(`L ${fmt(cTR.start.x)} ${fmt(cTR.start.y)}`);
  seg.push(cTR.cmd);
  seg.push(`L ${fmt(cBR.start.x)} ${fmt(cBR.start.y)}`);
  seg.push(cBR.cmd);

  // ── Bottom edge with a concave well carved near the notch corner ──
  // The well lives toward `notchCorner`. We build it as: bottom edge → smooth
  // dip in → curved hug (semi-circular-ish, but eased) → smooth dip out → edge.
  const wellCenterX =
    notchCorner === "BL" ? notchDepth + notchWidth * 0.5 : w - notchDepth - notchWidth * 0.5;

  const wellHalf = notchWidth * 0.5 + notchDepth; // total horizontal reach of the dip
  const leftX = wellCenterX - wellHalf;
  const rightX = wellCenterX + wellHalf;
  const dipY = h - notchDepth; // how high the hug rises into the card

  // Two eased transition handles + a soft hug. We approximate the hug with two
  // cubics meeting at the top of the dip, pulled by `smoothing` for organic feel.
  const ease = lerp(0.4, 0.62, Math.max(0, Math.min(1, smoothing)));

  // Walking right→left along the bottom (clockwise), we reach `rightX` first.
  seg.push(`L ${fmt(rightX)} ${fmt(h)}`);
  // dip in to the right wall of the well
  seg.push(
    `C ${fmt(rightX - notchDepth * ease)} ${fmt(h)} ` +
      `${fmt(wellCenterX + notchWidth * 0.5)} ${fmt(dipY + notchDepth * ease)} ` +
      `${fmt(wellCenterX + notchWidth * 0.5)} ${fmt(dipY)}`,
  );
  // flat-ish top of the well (the curved hug region)
  seg.push(`L ${fmt(wellCenterX - notchWidth * 0.5)} ${fmt(dipY)}`);
  // dip out to the bottom edge again
  seg.push(
    `C ${fmt(wellCenterX - notchWidth * 0.5)} ${fmt(dipY + notchDepth * ease)} ` +
      `${fmt(leftX + notchDepth * ease)} ${fmt(h)} ` +
      `${fmt(leftX)} ${fmt(h)}`,
  );

  // continue bottom edge to the BL corner start
  seg.push(`L ${fmt(cBL.start.x)} ${fmt(cBL.start.y)}`);
  seg.push(cBL.cmd);
  seg.push("Z");

  return seg.join(" ");
}
