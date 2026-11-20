/*
 * Icon geometry adapted from Lucide (https://lucide.dev).
 *
 * ISC License
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this permission notice appear
 * in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
 * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE
 * OF THIS SOFTWARE.
 */

type Node = [tag: "path" | "circle" | "rect" | "polyline" | "polygon" | "ellipse", attrs: Record<string, string | number>];

const p = (...d: string[]): Node[] => d.map((v) => ["path", { d: v }]);
const circle = (cx: number, cy: number, r: number): Node => ["circle", { cx, cy, r }];
const rect = (x: number, y: number, width: number, height: number, rx = 2): Node => ["rect", { x, y, width, height, rx }];

export const ICONS: Record<string, Node[]> = {
  check: p("M20 6 9 17l-5-5"),
  x: p("M18 6 6 18", "m6 6 12 12"),
  plus: p("M5 12h14", "M12 5v14"),
  "arrow-right": p("M5 12h14", "m12 5 7 7-7 7"),
  "chevron-right": p("m9 18 6-6-6-6"),
  zap: [["polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2" }]],
  shield: p("M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"),
  "shield-check": p(
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ),
  lock: [rect(3, 11, 18, 11), ...p("M7 11V7a5 5 0 0 1 10 0v4")],
  users: [...p("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"), circle(9, 7, 4)],
  user: [...p("M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"), circle(12, 7, 4)],
  heart: p("M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"),
  star: [["polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }]],
  sparkles: p(
    "M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0l1.58 6.13a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z",
    "M20 3v4",
    "M22 5h-4",
  ),
  chart: p("M3 3v18h18", "M18 17V9", "M13 17V5", "M8 17v-3"),
  "trending-up": [
    ["polyline", { points: "22 7 13.5 15.5 8.5 10.5 2 17" }],
    ["polyline", { points: "16 7 22 7 22 13" }],
  ],
  clock: [circle(12, 12, 10), ["polyline", { points: "12 6 12 12 16 14" }]],
  calendar: [rect(3, 4, 18, 18), ...p("M16 2v4", "M8 2v4", "M3 10h18")],
  globe: [circle(12, 12, 10), ...p("M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20")],
  mail: [rect(2, 4, 20, 16), ...p("m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7")],
  phone: p(
    "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  ),
  "map-pin": [...p("M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"), circle(12, 10, 3)],
  message: p("M7.9 20A9 9 0 1 0 4 16.1L2 22Z"),
  search: [circle(11, 11, 8), ...p("m21 21-4.3-4.3")],
  settings: [...p("M20 7h-9", "M14 17H5"), circle(17, 17, 3), circle(7, 7, 3)],
  layers: p(
    "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z",
    "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65",
    "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65",
  ),
  layout: [rect(3, 3, 7, 7, 1), rect(14, 3, 7, 7, 1), rect(14, 14, 7, 7, 1), rect(3, 14, 7, 7, 1)],
  target: [circle(12, 12, 10), circle(12, 12, 6), circle(12, 12, 2)],
  rocket: p(
    "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z",
    "m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z",
    "M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0",
    "M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
  ),
  code: [
    ["polyline", { points: "16 18 22 12 16 6" }],
    ["polyline", { points: "8 6 2 12 8 18" }],
  ],
  cpu: [rect(4, 4, 16, 16), rect(9, 9, 6, 6, 1), ...p("M15 2v2", "M15 20v2", "M2 15h2", "M2 9h2", "M20 15h2", "M20 9h2", "M9 2v2", "M9 20v2")],
  cloud: p("M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"),
  database: [["ellipse", { cx: 12, cy: 5, rx: 9, ry: 3 }], ...p("M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12")],
  wallet: p(
    "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  ),
  "credit-card": [rect(2, 5, 20, 14), ...p("M2 10h20")],
  dollar: [circle(12, 12, 10), ...p("M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8", "M12 18V6")],
  gift: [
    rect(3, 8, 18, 4, 1),
    ...p("M12 8v13", "M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7", "M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"),
  ],
  book: p("M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z", "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"),
  "graduation-cap": p(
    "M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z",
    "M22 10v6",
    "M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  ),
  lightbulb: p(
    "M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5",
    "M9 18h6",
    "M10 22h4",
  ),
  activity: p("M22 12h-4l-3 9L9 3l-3 9H2"),
  leaf: p("M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"),
  smile: [circle(12, 12, 10), ...p("M8 14s1.5 2 4 2 4-2 4-2", "M9 9h.01", "M15 9h.01")],
  award: [circle(12, 8, 6), ...p("M15.48 12.89 17 22l-5-3-5 3 1.52-9.11")],
  briefcase: [rect(2, 7, 20, 14), ...p("M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16")],
  home: p(
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ),
  camera: [...p("M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"), circle(12, 13, 3)],
  play: [circle(12, 12, 10), ["polygon", { points: "10 8 16 12 10 16 10 8" }]],
  bell: p("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"),
  refresh: p(
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5",
  ),
  link: p(
    "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
    "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  ),
  "file-text": p("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4", "M10 9H8", "M16 13H8", "M16 17H8"),
  eye: [...p("M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"), circle(12, 12, 3)],
  truck: [
    ...p(
      "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
      "M15 18H9",
      "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14",
    ),
    circle(17, 18, 2),
    circle(7, 18, 2),
  ],
  dumbbell: p(
    "M14.4 14.4 9.6 9.6",
    "M18.66 21.49a2 2 0 1 1-2.83-2.83l-1.77 1.77a2 2 0 1 1-2.83-2.83l6.36-6.36a2 2 0 1 1 2.83 2.83l-1.77 1.77a2 2 0 1 1 2.83 2.83z",
    "m21.5 21.5-1.4-1.4",
    "M3.9 3.9 2.5 2.5",
    "M6.4 12.77a2 2 0 1 1-2.83-2.83l1.77-1.77a2 2 0 1 1-2.83-2.83l2.83-2.83a2 2 0 1 1 2.83 2.83l1.77-1.77a2 2 0 1 1 2.83 2.83z",
  ),
  stethoscope: [
    ...p("M11 2v2", "M5 2v2", "M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1", "M8 15a6 6 0 0 0 12 0v-3"),
    circle(20, 10, 2),
  ],
  quote: p(
    "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
    "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
  ),
  dot: [circle(12, 12, 4)],
};

const ALIASES: Record<string, string> = {
  bolt: "zap",
  lightning: "zap",
  fast: "zap",
  speed: "zap",
  security: "shield",
  secure: "lock",
  privacy: "lock",
  team: "users",
  people: "users",
  community: "users",
  analytics: "chart",
  "bar-chart": "chart",
  "bar-chart-3": "chart",
  growth: "trending-up",
  time: "clock",
  schedule: "calendar",
  email: "mail",
  location: "map-pin",
  chat: "message",
  "message-circle": "message",
  idea: "lightbulb",
  money: "dollar",
  "circle-dollar-sign": "dollar",
  health: "activity",
  fitness: "dumbbell",
  medical: "stethoscope",
  education: "graduation-cap",
  learn: "book",
  "book-open": "book",
  "layout-grid": "layout",
  "refresh-cw": "refresh",
  "settings-2": "settings",
  "check-circle": "check",
  "circle-check": "check",
  "circle-play": "play",
  "map": "map-pin",
  world: "globe",
  "message-square": "message",
};

export function normalizeIconName(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-icon$/, "");
}

export function resolveIconName(name: string | undefined): string | null {
  if (!name) return null;
  const key = normalizeIconName(name);
  if (ICONS[key]) return key;
  if (ALIASES[key]) return ALIASES[key]!;
  return "dot";
}

const KEYWORDS: [RegExp, string][] = [
  [/secur|safe|protect|privacy|complian|trust/i, "shield-check"],
  [/fast|speed|instant|quick|real-?time|automat/i, "zap"],
  [/team|collab|share|people|communit|member/i, "users"],
  [/analytic|insight|report|data|metric|dashboard|track/i, "chart"],
  [/grow|scale|increase|revenue|boost/i, "trending-up"],
  [/time|schedul|hour|minute|deadline/i, "clock"],
  [/calendar|book(ing)?|appointment|plan/i, "calendar"],
  [/global|world|language|international/i, "globe"],
  [/mail|inbox|newsletter/i, "mail"],
  [/support|chat|message|talk|help/i, "message"],
  [/pay|price|cost|money|budget|save|saving|invoice|billing/i, "wallet"],
  [/learn|lesson|course|teach|school|student|kid|class/i, "graduation-cap"],
  [/health|care|wellness|doctor|patient|clinic|medic/i, "stethoscope"],
  [/fitness|workout|train|gym|exercise|strength/i, "dumbbell"],
  [/integrat|connect|api|link|sync/i, "link"],
  [/code|develop|engineer/i, "code"],
  [/cloud|host|deploy|server/i, "cloud"],
  [/idea|creative|inspir/i, "lightbulb"],
  [/award|quality|premium|certif/i, "award"],
  [/eco|green|sustain|natural|organic/i, "leaf"],
  [/deliver|ship|logistic/i, "truck"],
  [/custom|setting|control|configur|personal/i, "settings"],
  [/love|favorite|kind|care/i, "heart"],
];

const ROTATION = ["sparkles", "layers", "target", "zap", "shield-check", "heart"];

export function inferIconName(title: string, index: number): string {
  for (const [pattern, icon] of KEYWORDS) if (pattern.test(title)) return icon;
  return ROTATION[index % ROTATION.length]!;
}

export function iconSvg(name: string, className = "icon"): string {
  const nodes = ICONS[name] ?? ICONS.dot!;
  const children = nodes
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(" ")} />`)
    .join("");
  const fill = name === "dot" ? ` fill="currentColor"` : ` fill="none"`;
  return `<svg className="${className}" viewBox="0 0 24 24"${fill} stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">${children}</svg>`;
}
