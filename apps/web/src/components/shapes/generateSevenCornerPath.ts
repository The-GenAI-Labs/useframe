import type { SevenCornerParams } from "./types";
import { convexCorner, fmt, lerp, type Pt } from "./smoothCorner";

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

  const notchDepth = params.notchDepth ?? Math.min(w, h) * 0.26;
  const notchWidth = params.notchWidth ?? notchDepth * 1.6;

  const TL: Pt = { x: 0, y: 0 };
  const TR: Pt = { x: w, y: 0 };
  const BR: Pt = { x: w, y: h };
  const BL: Pt = { x: 0, y: h };

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

  const wellCenterX =
    notchCorner === "BL" ? notchDepth + notchWidth * 0.5 : w - notchDepth - notchWidth * 0.5;

  const wellHalf = notchWidth * 0.5 + notchDepth;
  const leftX = wellCenterX - wellHalf;
  const rightX = wellCenterX + wellHalf;
  const dipY = h - notchDepth;

  const ease = lerp(0.4, 0.62, Math.max(0, Math.min(1, smoothing)));

  seg.push(`L ${fmt(rightX)} ${fmt(h)}`);
  seg.push(
    `C ${fmt(rightX - notchDepth * ease)} ${fmt(h)} ` +
      `${fmt(wellCenterX + notchWidth * 0.5)} ${fmt(dipY + notchDepth * ease)} ` +
      `${fmt(wellCenterX + notchWidth * 0.5)} ${fmt(dipY)}`,
  );
  seg.push(`L ${fmt(wellCenterX - notchWidth * 0.5)} ${fmt(dipY)}`);
  seg.push(
    `C ${fmt(wellCenterX - notchWidth * 0.5)} ${fmt(dipY + notchDepth * ease)} ` +
      `${fmt(leftX + notchDepth * ease)} ${fmt(h)} ` +
      `${fmt(leftX)} ${fmt(h)}`,
  );

  seg.push(`L ${fmt(cBL.start.x)} ${fmt(cBL.start.y)}`);
  seg.push(cBL.cmd);
  seg.push("Z");

  return seg.join(" ");
}
