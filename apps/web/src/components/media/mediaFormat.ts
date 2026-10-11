import type { MediaUsage } from "@/lib/api/services/media.service"

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

const SECTION_LABELS: Record<string, string> = {
  HERO: "Hero",
  FEATURES: "Features",
  HOW_IT_WORKS: "How it works",
  TESTIMONIALS: "Testimonials",
  TEAM: "Team",
  CTA: "Call to action",
  CUSTOM: "Showcase",
  HEADER: "Header",
}

export function usageLabel(usage: MediaUsage): string {
  const section = SECTION_LABELS[usage.sectionType] ?? usage.sectionType
  const item = /^item-(\d+)$/.exec(usage.slotKey)
  const detail = item ? ` · item ${Number(item[1]) + 1}` : usage.slotKey === "background" ? " · background" : ""
  return `${usage.pageTitle} → ${section}${detail}`
}
