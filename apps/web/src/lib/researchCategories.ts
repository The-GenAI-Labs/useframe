import type { ResearchCategory } from "@repo/schemas";

export const RESEARCH_CATEGORY_LABELS: Record<ResearchCategory, string> = {
  COLOR_PSYCHOLOGY: "Color psychology",
  TYPOGRAPHY: "Typography",
  SCREEN_TIME: "Screen time",
  LAYOUT: "Layout",
  CONVERSION: "Conversion",
  ACCESSIBILITY: "Accessibility",
  AGE_GROUP: "Age groups",
  INDUSTRY: "Industry",
  MOTION: "Motion",
  OTHER: "Other",
};

export function categoryLabel(category: string): string {
  return RESEARCH_CATEGORY_LABELS[category as ResearchCategory] ?? category;
}

export function paperLink(source: { doi: string | null; url: string | null }): string | null {
  if (source.doi) return `https://doi.org/${source.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
  return source.url && /^https?:\/\//i.test(source.url) ? source.url : null;
}
