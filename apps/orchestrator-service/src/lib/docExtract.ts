import { fork } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { DocKind, ExtractRequest, ExtractResponse } from "./docExtract.child.js"

const CHILD_ENV_FLAG = "USEFRAME_DOC_EXTRACT_CHILD"

export type { DocKind }

const MIME_TO_KIND: Record<string, DocKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
}

export function kindForMime(mime: string): DocKind | null {
  return MIME_TO_KIND[mime] ?? null
}

// dist/ ships .js; under tsx watch the source .ts is what exists.
function childEntry(): string {
  const js = fileURLToPath(new URL("./docExtract.child.js", import.meta.url))
  return existsSync(js) ? js : fileURLToPath(new URL("./docExtract.child.ts", import.meta.url))
}

export function extractDocumentText(
  kind: DocKind,
  data: Uint8Array,
  opts: { maxChars: number; timeoutMs: number; signal?: AbortSignal },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = fork(childEntry(), [], {
      execArgv: [...process.execArgv, "--max-old-space-size=256"],
      serialization: "advanced",
      // The child parses untrusted files, so it gets no secrets.
      env: {
        [CHILD_ENV_FLAG]: "1",
        ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        ...(process.env.TEMP ? { TEMP: process.env.TEMP, TMP: process.env.TMP ?? process.env.TEMP } : {}),
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      opts.signal?.removeEventListener("abort", onAbort)
      if (child.exitCode === null) child.kill("SIGKILL")
      fn()
    }
    const onAbort = () => finish(() => reject(new Error("cancelled")))
    const timer = setTimeout(() => finish(() => reject(new Error("extraction timed out"))), opts.timeoutMs)
    opts.signal?.addEventListener("abort", onAbort, { once: true })

    child.once("message", (msg: ExtractResponse) =>
      finish(() => (msg.ok ? resolve(msg.text) : reject(new Error("extraction failed")))),
    )
    child.once("error", () => finish(() => reject(new Error("extraction failed"))))
    child.once("exit", () => finish(() => reject(new Error("extraction failed"))))
    child.send({ kind, data, maxChars: opts.maxChars } satisfies ExtractRequest)
  })
}
