import { uuidFromKey } from "../hash.js"
import { classifyStatus, ProviderError, withProviderRetry, type VideoPollResult, type VideoProvider } from "./types.js"

export type RunwareConfig = {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

type RunwareError = { code?: string; message?: string; taskUUID?: string }
type RunwareItem = { taskUUID?: string; status?: string; videoURL?: string; cost?: number }

const dataUri = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`

// MiniMax H3 Max through Runware's task API: an array of tasks per request,
// async delivery, then getResponse polling with the same client-chosen taskUUID.
export class RunwareVideoProvider implements VideoProvider {
  readonly name = "runware"
  private readonly baseUrl: string
  private readonly doFetch: typeof fetch

  constructor(private readonly config: RunwareConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.runware.ai/v1").replace(/\/$/, "")
    this.doFetch = config.fetchImpl ?? fetch
  }

  get model(): string {
    return this.config.model
  }

  taskIdFor(requestKey: string): string {
    return uuidFromKey(requestKey)
  }

  private async call(tasks: unknown[]): Promise<{ data: RunwareItem[]; errors: RunwareError[] }> {
    let res: Response
    try {
      res = await this.doFetch(this.baseUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(tasks),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 60_000),
      })
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") throw new ProviderError("TRANSIENT", "Runware request timed out")
      throw err
    }
    const payload = (await res.json().catch(() => null)) as { data?: RunwareItem[]; errors?: RunwareError[] } | null
    if (!res.ok && !payload?.errors?.length) throw classifyStatus(res.status, `Runware ${res.status}: ${res.statusText}`)
    return { data: payload?.data ?? [], errors: payload?.errors ?? [] }
  }

  async submit(req: Parameters<VideoProvider["submit"]>[0]): Promise<{ taskId: string }> {
    const taskUUID = req.taskId ?? this.taskIdFor(req.requestKey)
    const frameImages = [
      { image: dataUri(req.firstFrame), frame: "first" },
      ...(req.lastFrame ? [{ image: dataUri(req.lastFrame), frame: "last" }] : []),
    ]
    const task = {
      taskType: "videoInference",
      taskUUID,
      model: this.config.model,
      positivePrompt: req.prompt,
      duration: req.durationSec,
      // With frame images the provider takes a resolution preset, not width/height.
      resolution: req.resolution,
      inputs: { frameImages },
      numberResults: req.results,
      promptExpansion: req.promptExpansion,
      outputFormat: "MP4",
      deliveryMethod: "async",
      includeCost: true,
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.deliverTo && req.results === 1 ? { uploadEndpoint: req.deliverTo.presignedPutUrl } : {}),
    }
    const { errors } = await withProviderRetry(() => this.call([task]))
    const error = errors[0]
    if (error) {
      // Resubmitting a task id the provider already holds is not a failure.
      if (/already exists|duplicate/i.test(error.message ?? "")) return { taskId: taskUUID }
      throw classifyStatus(400, `Runware: ${error.message ?? error.code ?? "submit failed"}`, error.code)
    }
    return { taskId: taskUUID }
  }

  async poll(taskId: string): Promise<VideoPollResult> {
    const { data, errors } = await withProviderRetry(() => this.call([{ taskType: "getResponse", taskUUID: taskId }]))
    const error = errors.find((e) => !e.taskUUID || e.taskUUID === taskId)
    if (error) {
      const classified = classifyStatus(400, `Runware: ${error.message ?? error.code ?? "task failed"}`, error.code)
      if (/not.?found|unknown task/i.test(`${error.code} ${error.message}`)) return { status: "FAILED", error: "TASK_NOT_FOUND" }
      return { status: classified.kind === "REFUSED" ? "REFUSED" : "FAILED", error: classified.message }
    }
    const items = data.filter((d) => !d.taskUUID || d.taskUUID === taskId)
    if (items.length === 0 || items.some((d) => d.status === "processing" || !d.status)) return { status: "RUNNING" }
    if (items.some((d) => d.status === "error")) return { status: "FAILED", error: "Runware reported an error status" }
    const cost = items.reduce((sum, d) => sum + (d.cost ?? 0), 0)
    return {
      status: "SUCCEEDED",
      outputs: items.map((d) => (d.videoURL ? { url: d.videoURL } : { delivered: true })),
      ...(cost > 0 ? { costUsd: cost } : {}),
    }
  }
}
