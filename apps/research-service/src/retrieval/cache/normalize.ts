import { createHash } from "node:crypto";
import type { DecisionArea, RetrievalInput } from "@repo/rag";
export function normalizeHydePassage(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function exactCacheKey(
  area: DecisionArea,
  niche: RetrievalInput["niche"],
  version: number,
  normalized: string,
) {
  return `rag:cache:exact:${area}:${niche}:${version}:${hash(normalized)}`;
}
