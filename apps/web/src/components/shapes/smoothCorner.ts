
export interface Pt {
  x: number;
  y: number;
}
export function cornerGeometry(radius: number, smoothing: number) {
  const s = clamp(smoothing, 0, 1);

  const arcSweepAngle = (90 * (1 - s)) / 1;
  const cornerRadius = radius;

  const p = ((1 + s) * cornerRadius) / 1;
  const angleRad = (arcSweepAngle / 2) * (Math.PI / 180);

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

  const k = lerp(0.55, 0.93, clamp(smoothing, 0, 1));
  const c1 = { x: corner.x - inDir.x * p * (1 - k), y: corner.y - inDir.y * p * (1 - k) };
  const c2 = { x: corner.x + outDir.x * p * (1 - k), y: corner.y + outDir.y * p * (1 - k) };

  const cmd = `C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
  return { start, cmd };
}

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
  return Math.round(n * 100) / 100;
}
