import { mkdtemp, writeFile, mkdir, rm, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createRequire } from "node:module"
import type { SiteSpec } from "@repo/schemas"
import { buildSiteFiles, type SeoFiles } from "@repo/site-builder"

const require = createRequire(import.meta.url)

export type BuiltFile = { path: string; content: Buffer }

async function collectFiles(dir: string, base = dir): Promise<BuiltFile[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: BuiltFile[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, base)))
    } else {
      const content = await readFile(fullPath)
      const relativePath = path.relative(base, fullPath).split(path.sep).join("/")
      files.push({ path: relativePath, content })
    }
  }

  return files
}

/**
 * Writes the generated SiteSpec to a temp directory using the exact same
 * scaffold the WebContainer preview renders (via @repo/site-builder), runs a
 * real Vite build in-process (using the worker's own already-installed
 * react/react-router-dom/@vitejs/plugin-react — the temp dir needs no
 * node_modules of its own), and returns dist/ as a flat file list ready for
 * Vercel's deployments API.
 */
export async function buildStaticSite(spec: SiteSpec, seoFiles?: SeoFiles): Promise<BuiltFile[]> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "useframe-deploy-"))
  const outDir = path.join(tmpDir, "dist")

  try {
    const files = buildSiteFiles(spec, seoFiles)

    for (const file of files) {
      // package.json/vite.config.js from the shared scaffold aren't used here
      // — the build below is configured programmatically instead.
      if (file.path === "package.json" || file.path === "vite.config.js") continue
      const fullPath = path.join(tmpDir, file.path)
      await mkdir(path.dirname(fullPath), { recursive: true })
      await writeFile(fullPath, file.content, "utf-8")
    }

    const isMultiPage = files.some((f) => f.path.startsWith("src/pages/"))

    const { build } = await import("vite")
    const { default: react } = await import("@vitejs/plugin-react")

    await build({
      root: tmpDir,
      logLevel: "warn",
      plugins: [react()],
      resolve: {
        alias: {
          react: require.resolve("react"),
          "react-dom": require.resolve("react-dom"),
          ...(isMultiPage
            ? { "react-router-dom": require.resolve("react-router-dom") }
            : {}),
        },
      },
      build: {
        outDir,
        emptyOutDir: true,
      },
    })

    return await collectFiles(outDir)
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
