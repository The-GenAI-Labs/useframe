import { generateText } from "ai"
import { getModelForTier } from "@/llm/router.js"
import type { Tier } from "@repo/schemas"

export type ReplicationNextFile = { path: string; content: string }

const SYSTEM_PROMPT = `You are a senior Next.js engineer. Write complete, working Next.js 15 App
Router code (TypeScript, Tailwind) implementing the build spec below
exactly. Output every file needed: page.tsx, layout.tsx, components,
globals.css. Use the exact hex codes, exact asset URLs, and exact spacing
given - do not invent or approximate any of them.

Output each file as a fenced code block preceded by a line of the exact form:
FILE: <path>
For example:
FILE: app/page.tsx
\`\`\`tsx
...file contents...
\`\`\`
Output nothing else outside these FILE blocks.`

function parseFiles(text: string): ReplicationNextFile[] {
  const files: ReplicationNextFile[] = []
  const pattern = /FILE:\s*(\S+)\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const path = match[1]?.trim()
    const content = match[2]
    if (path && content !== undefined) files.push({ path, content })
  }
  return files
}

export async function generateReplicationNextFiles(
  buildSpec: string,
  tier: Tier,
): Promise<ReplicationNextFile[]> {
  const model = getModelForTier(tier)

  const { text } = await generateText({
    model,
    system: SYSTEM_PROMPT,
    prompt: buildSpec,
    experimental_telemetry: { isEnabled: true, functionId: "replication-nextjs-codegen" },
  })

  const files = parseFiles(text)
  if (files.length === 0) throw new Error("No files parsed from Next.js codegen output")
  return files
}
