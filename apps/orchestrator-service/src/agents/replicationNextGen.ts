import { generateText } from "ai";
import { getModelForTier, getProviderOptionsForTier } from "@/llm/router.js";
import type { Tier } from "@repo/schemas";
import path from "node:path";

export type ReplicationNextFile = { path: string; content: string };

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

This code will be statically exported (next build with output: "export").
NEVER generate:
- cookies() or headers() in Server Components
- API Routes (app/api/.../route.ts)
- Server Actions that write or mutate data
- fetch() calls without a fixed/cached result - no per-request dynamic data
- next/image without knowing final width/height (the optimizer is disabled)
- a dynamic route segment (app/[slug]/page.tsx) without also outputting a
  generateStaticParams() in the same file listing every slug explicitly
Client-side interactivity (useState, useEffect, onClick, CSS animations,
scroll listeners) is fine - none of that requires a server.

Output every file needed: app/page.tsx, app/layout.tsx, every component,
app/globals.css. Every component you import in a file must also be output
as its own FILE block - never import a component you have not written.
Keep components simple enough that the whole app fits in the response.
Only import installed packages: next, react, and react-dom. Use inline SVG
for icons. Components using hooks, event handlers or browser APIs must start
with "use client". Use CSS font stacks instead of next/font/google downloads.

Use the real asset URLs given directly in the generated code (hotlinked, not
re-uploaded) - never invent placeholder URLs. Give every hotlinked <img> an
onError fallback in case a cross-origin host blocks hotlinking, e.g.:
<img src={realUrl} onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement!.style.background = "<the section's exact background colour>" }} />
so a broken-image icon never shows.

Output each file as a fenced code block preceded by a line of the exact form:
FILE: <path>
For example:
FILE: app/page.tsx
\`\`\`tsx
...file contents...
\`\`\`
Output nothing else outside these FILE blocks.`;

const CONTINUE_PROMPT = `Continue exactly where you left off. Do not repeat any FILE block you already
sent. Resume mid-file if the last one was cut off, then continue with any
remaining files, in the same FILE: <path> + fenced code block format.`;

const MAX_OUTPUT_TOKENS = 16_000;
const MAX_CONTINUATIONS = 5;
const MAX_REPAIR_ATTEMPTS = 2;

const FORBIDDEN_FILES = new Set([
  "package.json",
  "tailwind.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "next.config.js",
  "next.config.ts",
  "tsconfig.json",
]);

function parseFiles(text: string): ReplicationNextFile[] {
  const files: ReplicationNextFile[] = [];
  const pattern = /FILE:\s*(\S+)\s*\n```[a-zA-Z]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const path = match[1]?.trim();
    const content = match[2];
    if (path && content !== undefined)
      files.push({ path: path.replace(/^\.\//, ""), content });
  }
  return files.filter(
    (f) => !FORBIDDEN_FILES.has(f.path.replace(/^\.?\//, "")),
  );
}

function findMissingImports(files: ReplicationNextFile[]): string[] {
  const written = new Set(files.map((f) => f.path));
  const missing = new Set<string>();

  for (const file of files) {
    const importPattern = /(?:from\s*|import\s*\(?\s*)["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importPattern.exec(file.content)) !== null) {
      const imported = m[1];
      if (!imported) continue;
      if (!imported.startsWith("@/") && !imported.startsWith(".")) {
        if (
          !/^(next|react|react-dom)(\/|$)/.test(imported) ||
          imported === "next/font/google"
        ) {
          missing.add(
            `${imported} (not available in the preview; use next/react/react-dom and CSS font stacks)`,
          );
        }
        continue;
      }
      const target = imported.startsWith("@/")
        ? imported.slice(2)
        : path.posix.normalize(
            path.posix.join(path.posix.dirname(file.path), imported),
          );
      const candidates = [
        target,
        ...[".ts", ".tsx", ".js", ".jsx", ".json"].flatMap((extension) => [
          target + extension,
          `${target}/index${extension}`,
        ]),
      ];
      if (!candidates.some((candidate) => written.has(candidate)))
        missing.add(imported);
    }
  }

  return [...missing];
}

function findTailwindV4Syntax(files: ReplicationNextFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".css")) continue;
    if (/@import\s+["']tailwindcss["']/.test(file.content)) {
      problems.push(
        `${file.path}: uses Tailwind v4's @import "tailwindcss" instead of v3's @tailwind directives`,
      );
    }
    if (/@theme\b/.test(file.content)) {
      problems.push(
        `${file.path}: uses Tailwind v4's @theme block, which v3 does not support`,
      );
    }
  }
  return problems;
}

function findStaticExportViolations(files: ReplicationNextFile[]): string[] {
  const problems: string[] = [];

  for (const file of files) {
    if (
      /^app\/api\//.test(file.path) ||
      file.path.includes("/route.ts") ||
      file.path.includes("/route.tsx")
    ) {
      problems.push(
        `${file.path}: API Routes are not supported in a static export - remove this file`,
      );
    }

    if (
      /from\s+["']next\/headers["']/.test(file.content) ||
      /\b(cookies|headers)\s*\(/.test(file.content)
    ) {
      problems.push(
        `${file.path}: uses cookies()/headers(), which require a server and will break the static export`,
      );
    }

    if (/["']use server["']/.test(file.content)) {
      problems.push(
        `${file.path}: uses a Server Action ("use server"), which is not supported in a static export`,
      );
    }

    const dynamicSegmentMatch = file.path.match(/\[[^\]]+\]/);
    if (
      dynamicSegmentMatch &&
      file.path.endsWith("page.tsx") &&
      !/generateStaticParams\s*\(/.test(file.content)
    ) {
      problems.push(
        `${file.path}: dynamic route segment needs a generateStaticParams() export listing every slug`,
      );
    }
  }

  return problems;
}

function validate(files: ReplicationNextFile[]): string[] {
  const problems: string[] = [];

  if (!files.some((file) => /^app\/page\.(tsx|jsx|js|ts)$/.test(file.path))) {
    problems.push("Missing home page: output app/page.tsx");
  }
  const seen = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    if (
      file.path.includes("\\") ||
      file.path.includes(":") ||
      /[\u0000-\u001f]/.test(file.path) ||
      parts.some(
        (part) =>
          !part ||
          [".", "..", "__proto__", "constructor", "prototype"].includes(part),
      ) ||
      ["node_modules", ".next", ".git"].includes(parts[0] ?? "") ||
      parts.some((part) => part.startsWith(".env"))
    ) {
      problems.push(`Invalid file path: ${file.path}`);
    }
    if (seen.has(file.path)) problems.push(`Duplicate file: ${file.path}`);
    seen.add(file.path);
  }

  const missing = findMissingImports(files);
  if (missing.length > 0) {
    problems.push(
      `Missing component files for these imports: ${missing.join(", ")}`,
    );
  }

  problems.push(...findTailwindV4Syntax(files));
  problems.push(...findStaticExportViolations(files));

  return problems;
}

async function runGeneration(
  model: ReturnType<typeof getModelForTier>,
  providerOptions: ReturnType<typeof getProviderOptionsForTier>,
  messages: { role: "system" | "user" | "assistant"; content: string }[],
): Promise<ReplicationNextFile[]> {
  let fullText = "";
  let round = 0;

  while (round <= MAX_CONTINUATIONS) {
    const { text, finishReason } = await generateText({
      model,
      messages,
      maxTokens: MAX_OUTPUT_TOKENS,
      providerOptions,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "replication-nextjs-codegen",
      },
    });

    fullText += text;
    messages.push({ role: "assistant", content: text });

    if (finishReason !== "length") break;

    round += 1;
    if (round > MAX_CONTINUATIONS)
      throw new Error(
        "Next.js code generation was truncated. Please retry with a smaller page.",
      );

    messages.push({ role: "user", content: CONTINUE_PROMPT });
  }

  const files = parseFiles(fullText);
  if (files.length === 0)
    throw new Error("No files parsed from Next.js codegen output");
  return files;
}

export async function generateReplicationNextFiles(
  buildSpec: string,
  tier: Tier,
  onProgress?: (message: string) => void,
): Promise<ReplicationNextFile[]> {
  const model = getModelForTier(tier);
  const providerOptions = getProviderOptionsForTier(tier);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildSpec },
    ];

  let files = await runGeneration(model, providerOptions, messages);
  let problems = validate(files);

  let attempt = 0;
  while (problems.length > 0 && attempt < MAX_REPAIR_ATTEMPTS) {
    attempt += 1;
    onProgress?.("Reviewing generated code...");
    messages.push({
      role: "user",
      content: `The code you produced has these problems - fix them and resend every FILE block (not just the broken ones):\n${problems.map((p) => `- ${p}`).join("\n")}`,
    });
    files = await runGeneration(model, providerOptions, messages);
    problems = validate(files);
  }

  if (problems.length > 0) {
    throw new Error(
      `Generated app still has problems after ${MAX_REPAIR_ATTEMPTS} repair attempts: ${problems.join("; ")}`,
    );
  }

  return files;
}
