import { generateText } from "ai"
import { getModelForTier } from "@/llm/router.js"
import type { Tier } from "@repo/schemas"

export type ReplicationNextFile = { path: string; content: string }

const SYSTEM_PROMPT = `You are a senior Next.js engineer. Write complete, working Next.js 15 App
Router code (TypeScript) implementing the build spec below exactly. Use the
exact hex codes, exact asset URLs, and exact spacing given - do not invent
or approximate any of them.

The project uses React 19 and Tailwind CSS v3.4 (NOT v4) - these are already
installed and configured, do not write a package.json, tailwind.config.js,
postcss.config.js, next.config.js, or tsconfig.json, they already exist.

Tailwind v3 rules (v4 syntax will break the build):
- app/globals.css MUST start with exactly these three lines, nothing else
  at the top, no @import "tailwindcss":
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
- Use standard utility classes (bg-[#hex], text-[14px], etc.), never v4-only
  syntax like @theme, @import "tailwindcss", or CSS-first config.

Output every file needed: app/page.tsx, app/layout.tsx, every component,
app/globals.css. Every component you import in a file must also be output
as its own FILE block - never import a component you have not written.
Keep components simple enough that the whole app fits in the response.

Output each file as a fenced code block preceded by a line of the exact form:
FILE: <path>
For example:
FILE: app/page.tsx
\`\`\`tsx
...file contents...
\`\`\`
Output nothing else outside these FILE blocks.`

const CONTINUE_PROMPT = `Continue exactly where you left off. Do not repeat any FILE block you already
sent. Resume mid-file if the last one was cut off, then continue with any
remaining files, in the same FILE: <path> + fenced code block format.`

const MAX_OUTPUT_TOKENS = 16_000
const MAX_CONTINUATIONS = 2
const MAX_REPAIR_ATTEMPTS = 2

const FORBIDDEN_FILES = new Set([
  "package.json",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "next.config.js",
  "next.config.ts",
  "tsconfig.json",
])

function parseFiles(text: string): ReplicationNextFile[] {
  const files: ReplicationNextFile[] = []
  const pattern = /FILE:\s*(\S+)\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const path = match[1]?.trim()
    const content = match[2]
    if (path && content !== undefined) files.push({ path, content })
  }
  return files.filter((f) => !FORBIDDEN_FILES.has(f.path.replace(/^\.?\//, "")))
}

function findMissingImports(files: ReplicationNextFile[]): string[] {
  const written = new Set(files.map((f) => f.path.replace(/\.(tsx|ts)$/, "")))
  const missing = new Set<string>()

  for (const file of files) {
    const importPattern = /from\s+["']@\/([^"']+)["']/g
    let m: RegExpExecArray | null
    while ((m = importPattern.exec(file.content)) !== null) {
      const imported = m[1]
      if (imported && !written.has(imported)) missing.add(imported)
    }
  }

  return [...missing]
}

function findTailwindV4Syntax(files: ReplicationNextFile[]): string[] {
  const problems: string[] = []
  for (const file of files) {
    if (!file.path.endsWith(".css")) continue
    if (/@import\s+["']tailwindcss["']/.test(file.content)) {
      problems.push(`${file.path}: uses Tailwind v4's @import "tailwindcss" instead of v3's @tailwind directives`)
    }
    if (/@theme\b/.test(file.content)) {
      problems.push(`${file.path}: uses Tailwind v4's @theme block, which v3 does not support`)
    }
  }
  return problems
}

function validate(files: ReplicationNextFile[]): string[] {
  const problems: string[] = []

  const missing = findMissingImports(files)
  if (missing.length > 0) {
    problems.push(`Missing component files for these imports: ${missing.join(", ")}`)
  }

  problems.push(...findTailwindV4Syntax(files))

  return problems
}

async function runGeneration(
  model: ReturnType<typeof getModelForTier>,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<ReplicationNextFile[]> {
  let fullText = ""
  let round = 0

  while (round <= MAX_CONTINUATIONS) {
    const { text, finishReason } = await generateText({
      model,
      messages,
      maxTokens: MAX_OUTPUT_TOKENS,
      experimental_telemetry: { isEnabled: true, functionId: "replication-nextjs-codegen" },
    })

    fullText += text

    if (finishReason !== "length") break

    round += 1
    if (round > MAX_CONTINUATIONS) break

    messages.push({ role: "assistant", content: text })
    messages.push({ role: "user", content: CONTINUE_PROMPT })
  }

  const files = parseFiles(fullText)
  if (files.length === 0) throw new Error("No files parsed from Next.js codegen output")
  return files
}

export async function generateReplicationNextFiles(
  buildSpec: string,
  tier: Tier,
  onProgress?: (message: string) => void,
): Promise<ReplicationNextFile[]> {
  const model = getModelForTier(tier)

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildSpec },
  ]

  let files = await runGeneration(model, messages)
  let problems = validate(files)

  let attempt = 0
  while (problems.length > 0 && attempt < MAX_REPAIR_ATTEMPTS) {
    attempt += 1
    onProgress?.("Reviewing generated code...")
    messages.push({
      role: "user",
      content: `The code you produced has these problems - fix them and resend every FILE block (not just the broken ones):\n${problems.map((p) => `- ${p}`).join("\n")}`,
    })
    files = await runGeneration(model, messages)
    problems = validate(files)
  }

  if (problems.length > 0) {
    throw new Error(`Generated app still has problems after ${MAX_REPAIR_ATTEMPTS} repair attempts: ${problems.join("; ")}`)
  }

  return files
}
