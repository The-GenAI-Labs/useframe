export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

export function uniqueSlug(base: string): string {
  const suffix = Math.random().toString(36).slice(2, 7)
  return `${slugify(base)}-${suffix}`
}
