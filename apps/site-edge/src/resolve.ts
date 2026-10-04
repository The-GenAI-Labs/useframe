export type SiteEntry =
  | { v: 1; t: "p"; k: string; m: "n" | "s" }
  | { v: 1; t: "r"; u: string }
  | { v: 1; t: "x" };

export type Plan =
  | { kind: "redirect"; path: string }
  | { kind: "object"; key: string; onMiss: "404" | "none" };

const DEPLOYMENT_KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export function normalizePath(rawPathname: string): { ok: true; path: string } | { ok: false } {
  let p: string;
  try {
    p = decodeURIComponent(rawPathname);
  } catch {
    return { ok: false };
  }
  if (!p.startsWith("/")) return { ok: false };
  if (/[\u0000-\u001f\u007f\\]/.test(p)) return { ok: false };
  if (p.includes("//")) return { ok: false };
  if (p.split("/").some((s) => s === ".." || s === ".")) return { ok: false };
  if (new TextEncoder().encode(p).length > 900) return { ok: false };
  return { ok: true, path: p };
}

export function planServe(mode: "n" | "s", path: string): Plan {
  if (path.startsWith("/.well-known/")) {
    return { kind: "object", key: path.slice(1), onMiss: "404" };
  }
  const last = path.slice(path.lastIndexOf("/") + 1);
  const hasExt = last.includes(".");
  if (mode === "s") {
    if (!hasExt) return { kind: "object", key: "index.html", onMiss: "none" };
    return { kind: "object", key: path.slice(1), onMiss: "404" };
  }
  if (path.endsWith("/")) return { kind: "object", key: path.slice(1) + "index.html", onMiss: "404" };
  if (hasExt) return { kind: "object", key: path.slice(1), onMiss: "404" };
  return { kind: "redirect", path: path + "/" };
}

export function parseEntry(value: unknown): SiteEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  if (e.v !== 1) return null;
  if (e.t === "p") {
    if (typeof e.k !== "string" || !DEPLOYMENT_KEY.test(e.k)) return null;
    if (e.m !== "n" && e.m !== "s") return null;
    return { v: 1, t: "p", k: e.k, m: e.m };
  }
  if (e.t === "r") {
    if (typeof e.u !== "string" || !/^https:\/\/[^/]+$/.test(e.u)) return null;
    return { v: 1, t: "r", u: e.u };
  }
  if (e.t === "x") return { v: 1, t: "x" };
  return null;
}

export function parseHostList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPassThroughPath(path: string): boolean {
  return (
    path.startsWith("/.well-known/pki-validation/") ||
    path.startsWith("/.well-known/acme-challenge/") ||
    path.startsWith("/.well-known/cf-custom-hostname-challenge/")
  );
}

export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, "");
  const target = bare(etag);
  return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || bare(tag) === target);
}
