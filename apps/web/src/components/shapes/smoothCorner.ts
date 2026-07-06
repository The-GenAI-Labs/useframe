
export interface Pt {
  x: number;
  y: number;
}
export function cornerGeometry(radius: number, smoothing: number) {
  const s = clamp(smoothing, 0, 1);

  // Total angle the rounded section occupies; smoothing eats into the 90°.
  const arcSweepAngle = (90 * (1 - s)) / 1; // degrees of pure arc remaining
  const cornerRadius = radius;

  // Figma's distances (see corner-smoothing derivation).
  const p = ((1 + s) * cornerRadius) / 1;
  const angleRad = (arcSweepAngle / 2) * (Math.PI / 180);

  // Length consumed along each straight edge before the curve begins.
  const longestEdge = cornerRadius * Math.tan(((90 - arcSweepAngle) / 2) * (Math.PI / 180));
  const a = cornerRadius * Math.sin(angleRad);
  const b = cornerRadius * (1 - Math.cos(angleRad));

  return { p, a, b, arcSweepAngle, cornerRadius, edge: longestEdge };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function convexCorner(
  corner: Pt,
  radius: number,
  smoothing: number,
  // unit vector of the edge we arrive ALONG (pointing toward the corner)
  inDir: Pt,
  // unit vector of the edge we leave ALONG (pointing away from the corner)
  outDir: Pt,
): { start: Pt; cmd: string } {
  const r = Math.max(0, radius);
  if (r === 0) {
    return { start: corner, cmd: `L ${fmt(corner.x)} ${fmt(corner.y)}` };
  }

  const { p } = cornerGeometry(r, smoothing);

  // Points where the curve meets the straight edges, `p` back from the corner.
  const start = { x: corner.x - inDir.x * p, y: corner.y - inDir.y * p };
  const end = { x: corner.x + outDir.x * p, y: corner.y + outDir.y * p };

  // Control points pull toward the sharp corner — this is what produces the
  // continuous, non-circular superellipse curvature. The pull factor shrinks the
  // handle as smoothing rises so the shoulders blend smoothly into the edges.
  const k = lerp(0.55, 0.93, clamp(smoothing, 0, 1)); // handle strength
  const c1 = { x: corner.x - inDir.x * p * (1 - k), y: corner.y - inDir.y * p * (1 - k) };
  const c2 = { x: corner.x + outDir.x * p * (1 - k), y: corner.y + outDir.y * p * (1 - k) };

  const cmd = `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  return { start, cmd };
}

/**
 * Concave corner — the curve bulges INWARD (toward the shape's interior) so a
 * circle can nestle into the seam. Same smoothing model, opposite curvature.
 * Used for the notch that hugs the rotating badge.
 */
export function concaveCorner(
  corner: Pt,
  radius: number,
  smoothing: number,
  inDir: Pt,
  outDir: Pt,
): { start: Pt; cmd: string } {
  const r = Math.max(0, radius);
  if (r === 0) {
    return { start: corner, cmd: `L ${fmt(corner.x)} ${fmt(corner.y)}` };
  }
  const { p } = cornerGeometry(r, smoothing);

  const start = { x: corner.x - inDir.x * p, y: corner.y - inDir.y * p };
  const end = { x: corner.x + outDir.x * p, y: corner.y + outDir.y * p };

  // For a concave bend the handles pull AWAY from the corner (toward the edges'
  // continuation past the corner), flipping the bulge direction.
  const k = lerp(0.55, 0.93, clamp(smoothing, 0, 1));
  const c1 = { x: start.x + inDir.x * p * (1 - k), y: start.y + inDir.y * p * (1 - k) };
  const c2 = { x: end.x - outDir.x * p * (1 - k), y: end.y - outDir.y * p * (1 - k) };

  const cmd = `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  return { start, cmd };
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function fmt(n: number) {
  // Trim noise to keep paths compact and avoid sub-pixel jitter.
  return Math.round(n * 100) / 100;
}
