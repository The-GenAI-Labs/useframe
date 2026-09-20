import type { SiteSpec } from "@repo/schemas"
import type { FileSystemTree } from "@webcontainer/api"
import { buildSiteFiles, type SeoFiles } from "@repo/site-builder"

export type { SeoFiles }

export function buildFsTree(spec: SiteSpec, seoFiles?: SeoFiles): FileSystemTree {
  const files = buildSiteFiles(spec, seoFiles)
  const tree: FileSystemTree = {}

  for (const { path, content } of files) {
    const parts = path.split("/")
    const fileName = parts.pop()!
    let cursor = tree

    for (const dir of parts) {
      const existing = cursor[dir]
      if (existing && "directory" in existing) {
        cursor = existing.directory
      } else {
        const dirNode: FileSystemTree = {}
        cursor[dir] = { directory: dirNode }
        cursor = dirNode
      }
    }

    cursor[fileName] = { file: { contents: content } }
  }

  return tree
}
