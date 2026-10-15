import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { requestKey } from "../src/hash.js"
import { OpenAiImageProvider } from "../src/providers/openai.js"
import { RunwareVideoProvider } from "../src/providers/runware.js"
import { ProviderError, withProviderRetry } from "../src/providers/types.js"

// Response bodies shaped from the providers' documented formats; no network is used.
const fixture = (name: string, taskId?: string) => {
  const text = readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")
  return JSON.parse(taskId ? text.replaceAll("TASK", taskId) : text) as unknown
}

type Sent = { url: string; init: RequestInit }

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const sent: Sent[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), init: init ?? {} })
    const next = responses.shift() ?? { status: 500, body: {} }
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
  return { sent, impl }
}

describe("OpenAiImageProvider", () => {
  it("generates with a JSON request and reads b64 image data and cost", async () => {
    const f = fakeFetch([{ status: 200, body: fixture("openai-images-generation.json") }])
    const provider = new OpenAiImageProvider({ apiKey: "test-key", model: "gpt-image-2.5-sunburst", fetchImpl: f.impl })
    const res = await provider.generate({ prompt: "a desk", size: "1536x1024", quality: "high", format: "png", requestKey: "k" })
    expect(f.sent[0]!.url).toBe("https://api.openai.com/v1/images/generations")
    expect(JSON.parse(String(f.sent[0]!.init.body))).toMatchObject({ model: "gpt-image-2.5-sunburst", size: "1536x1024", quality: "high", n: 1 })
    expect(res.bytes.subarray(0, 4).toString("hex")).toBe("89504e47")
    expect(res.costUsd).toBeGreaterThan(0)
  })

  it("edits with multipart image[] fields", async () => {
    const f = fakeFetch([{ status: 200, body: fixture("openai-images-generation.json") }])
    const provider = new OpenAiImageProvider({ apiKey: "test-key", model: "m", fetchImpl: f.impl })
    await provider.edit({ prompt: "same scene", images: [Buffer.from("png")], size: "1536x1024", quality: "high", format: "png", requestKey: "k" })
    const form = f.sent[0]!.init.body as FormData
    expect(f.sent[0]!.url).toMatch(/\/images\/edits$/)
    expect(form.getAll("image[]")).toHaveLength(1)
  })

  it("classifies moderation and size errors", async () => {
    const refused = fakeFetch([{ status: 400, body: fixture("openai-images-moderation-error.json") }])
    await expect(
      new OpenAiImageProvider({ apiKey: "k", model: "m", fetchImpl: refused.impl }).generate({ prompt: "p", size: "1024x1024", quality: "high", format: "png", requestKey: "k" }),
    ).rejects.toMatchObject({ kind: "REFUSED" })
    const size = fakeFetch([{ status: 400, body: fixture("openai-images-size-error.json") }])
    await expect(
      new OpenAiImageProvider({ apiKey: "k", model: "m", fetchImpl: size.impl }).generate({ prompt: "p", size: "1000x1000", quality: "high", format: "png", requestKey: "k" }),
    ).rejects.toMatchObject({ kind: "INVALID_SIZE" })
  })
})

describe("RunwareVideoProvider", () => {
  const key = requestKey("job-1", "VIDEO", "vid-1", 1)

  it("submits an async first/last-frame task with a task id derived from the request key", async () => {
    const provider = new RunwareVideoProvider({ apiKey: "k", model: "minimax:h3@max", fetchImpl: fakeFetch([]).impl })
    const taskId = provider.taskIdFor(key)
    const f = fakeFetch([{ status: 200, body: fixture("runware-submit-ack.json", taskId) }])
    const runware = new RunwareVideoProvider({ apiKey: "k", model: "minimax:h3@max", fetchImpl: f.impl })
    const res = await runware.submit({
      prompt: "papers fold",
      firstFrame: Buffer.from("a"),
      lastFrame: Buffer.from("b"),
      durationSec: 6,
      resolution: "768p",
      results: 1,
      promptExpansion: "disabled",
      requestKey: key,
    })
    expect(res.taskId).toBe(taskId)
    const [task] = JSON.parse(String(f.sent[0]!.init.body)) as Record<string, unknown>[]
    expect(task).toMatchObject({ taskType: "videoInference", taskUUID: taskId, resolution: "768p", deliveryMethod: "async", duration: 6, includeCost: true })
    expect((task!.inputs as { frameImages: { frame: string }[] }).frameImages.map((f) => f.frame)).toEqual(["first", "last"])
  })

  it("reuses a stored task id on resume", async () => {
    const f = fakeFetch([{ status: 200, body: fixture("runware-submit-ack.json", "stored-id") }])
    const runware = new RunwareVideoProvider({ apiKey: "k", model: "m", fetchImpl: f.impl })
    const res = await runware.submit({ prompt: "p", firstFrame: Buffer.from("a"), durationSec: 5, resolution: "768p", results: 1, promptExpansion: "disabled", requestKey: key, taskId: "stored-id" })
    expect(res.taskId).toBe("stored-id")
  })

  it("maps poll responses to running, succeeded, not found and refused", async () => {
    const f = fakeFetch([
      { status: 200, body: fixture("runware-poll-processing.json", "t1") },
      { status: 200, body: fixture("runware-poll-success.json", "t1") },
      { status: 400, body: fixture("runware-poll-not-found.json", "t1") },
      { status: 400, body: fixture("runware-poll-moderation.json", "t1") },
    ])
    const runware = new RunwareVideoProvider({ apiKey: "k", model: "m", fetchImpl: f.impl })
    expect(await runware.poll("t1")).toEqual({ status: "RUNNING" })
    expect(await runware.poll("t1")).toEqual({ status: "SUCCEEDED", outputs: [{ url: "https://vm.runware.ai/video/ws/5/vi/b7c1.mp4" }], costUsd: 0.48 })
    expect(await runware.poll("t1")).toEqual({ status: "FAILED", error: "TASK_NOT_FOUND" })
    expect((await runware.poll("t1")).status).toBe("REFUSED")
  })
})

describe("withProviderRetry", () => {
  it("retries transient failures with backoff, then gives up", async () => {
    let calls = 0
    const waits: number[] = []
    await expect(
      withProviderRetry(
        async () => {
          calls++
          throw new ProviderError("TRANSIENT", "busy", 503)
        },
        3,
        10,
        async (ms) => void waits.push(ms),
      ),
    ).rejects.toMatchObject({ kind: "TRANSIENT" })
    expect(calls).toBe(3)
    expect(waits).toHaveLength(2)
  })

  it("does not retry refusals", async () => {
    let calls = 0
    await expect(
      withProviderRetry(async () => {
        calls++
        throw new ProviderError("REFUSED", "policy", 400)
      }),
    ).rejects.toMatchObject({ kind: "REFUSED" })
    expect(calls).toBe(1)
  })
})
