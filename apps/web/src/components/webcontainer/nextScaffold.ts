export type ReplicationNextFile = { path: string; content: string }

const PACKAGE_JSON = JSON.stringify(
  {
    name: "replica-preview",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: {
      next: "15.0.3",
      react: "19.0.0",
      "react-dom": "19.0.0",
    },
    devDependencies: {
      typescript: "5.6.3",
      "@types/node": "22.9.0",
      "@types/react": "19.0.0",
      "@types/react-dom": "19.0.0",
      tailwindcss: "3.4.14",
      postcss: "8.4.47",
      autoprefixer: "10.4.20",
    },
  },
  null,
  2,
)

const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
const nextConfig = {}
module.exports = nextConfig
`

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      plugins: [{ name: "next" }],
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  },
  null,
  2,
)

const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
}
`

const POSTCSS_CONFIG = `module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} },
}
`

const FALLBACK_LAYOUT = `import "./globals.css"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

const FALLBACK_GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;
`

const SCAFFOLD_FILES: ReplicationNextFile[] = [
  { path: "package.json", content: PACKAGE_JSON },
  { path: "next.config.js", content: NEXT_CONFIG },
  { path: "tsconfig.json", content: TSCONFIG },
  { path: "tailwind.config.js", content: TAILWIND_CONFIG },
  { path: "postcss.config.js", content: POSTCSS_CONFIG },
]

function normalizeToTailwindV3(css: string): string {
  return css
    .replace(/@import\s+["']tailwindcss["'];?\s*/g, "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n")
    .replace(/@theme\s*\{[^}]*\}/g, "")
}

export function withScaffold(llmFiles: ReplicationNextFile[]): ReplicationNextFile[] {
  const byPath = new Map(
    llmFiles.map((f) => [
      f.path.replace(/^\.?\//, ""),
      f.path.endsWith(".css") ? { ...f, content: normalizeToTailwindV3(f.content) } : f,
    ]),
  )

  for (const scaffoldFile of SCAFFOLD_FILES) {
    byPath.set(scaffoldFile.path, scaffoldFile)
  }
  if (!byPath.has("app/layout.tsx")) byPath.set("app/layout.tsx", { path: "app/layout.tsx", content: FALLBACK_LAYOUT })
  if (!byPath.has("app/globals.css")) byPath.set("app/globals.css", { path: "app/globals.css", content: FALLBACK_GLOBALS_CSS })

  return [...byPath.values()]
}
