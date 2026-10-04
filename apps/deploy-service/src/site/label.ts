import { randomInt } from "node:crypto";

const SUFFIX_ALPHABET = "bcdfghjkmnpqrstvwxyz23456789";
const MAX_BASE = 30;

export const RESERVED_LABELS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "mail",
  "cdn",
  "static",
  "status",
  "help",
  "docs",
  "blog",
  "auth",
  "login",
  "dashboard",
  "cname",
  "fallback",
  "edge",
  "sites",
]);

export function slugifyName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_BASE)
    .replace(/-+$/g, "");
  return base || "site";
}

export function randomSuffix(length: number, pick: (max: number) => number = randomInt): string {
  let out = "";
  for (let i = 0; i < length; i++) out += SUFFIX_ALPHABET[pick(SUFFIX_ALPHABET.length)];
  return out;
}

export function buildLabel(name: string, suffix: string): string {
  return `${slugifyName(name)}-${suffix}`;
}

export function isValidLabel(label: string): boolean {
  return (
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label) &&
    !label.includes("--") &&
    !RESERVED_LABELS.has(label)
  );
}

export function hostFor(label: string, baseDomain: string): string {
  return `${label}.${baseDomain}`;
}
