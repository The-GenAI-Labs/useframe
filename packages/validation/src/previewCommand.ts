import { z } from "zod";
export function detectPreviewCommand(
  files: { path: string; content: string }[],
) {
  const file = files.find((file) => file.path === "package.json");
  if (!file) throw new Error("Generated package.json is required for preview");
  const pkg = z
    .object({ scripts: z.object({ dev: z.string().min(1) }) })
    .parse(JSON.parse(file.content));
  const script = pkg.scripts.dev.trim();
  if (/^(?:vite|vite\.js)(?:\s|$)/.test(script))
    return { framework: "vite" as const, script };
  if (/^next\s+dev(?:\s|$)/.test(script))
    return { framework: "next" as const, script };
  throw new Error(`Unsupported generated dev script: ${script.slice(0, 150)}`);
}
