import { describe, expect, it } from "vitest"
import { isBlockedAddress, safeDownload, UnsafeDownloadError } from "@/lib/safeDownload.js"

const ALLOWED = ["vm.runware.ai"]
const publicDns = async () => ["104.18.10.10"]

function fetchOf(responses: Response[]) {
  const urls: string[] = []
  const impl = (async (url: string | URL | Request) => {
    urls.push(String(url))
    return responses.shift() ?? new Response(null, { status: 500 })
  }) as typeof fetch
  return { urls, impl }
}

describe("isBlockedAddress", () => {
  it.each(["127.0.0.1", "10.0.0.5", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "blocks %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(true),
  )

  it.each(["104.18.10.10", "8.8.8.8", "2606:4700::1111"])("allows %s", (ip) => expect(isBlockedAddress(ip)).toBe(false))
})

describe("safeDownload", () => {
  it("downloads from an allowed public host", async () => {
    const f = fetchOf([new Response("video-bytes", { status: 200 })])
    const bytes = await safeDownload("https://vm.runware.ai/video/a.mp4", { allowedHosts: ALLOWED, maxBytes: 1000, fetchImpl: f.impl, resolve: publicDns })
    expect(bytes.toString()).toBe("video-bytes")
  })

  it("rejects http, credentials, other hosts and private addresses before fetching", async () => {
    const f = fetchOf([])
    const opts = { allowedHosts: ALLOWED, maxBytes: 1000, fetchImpl: f.impl, resolve: publicDns }
    await expect(safeDownload("http://vm.runware.ai/a.mp4", opts)).rejects.toThrow(UnsafeDownloadError)
    await expect(safeDownload("https://u:p@vm.runware.ai/a.mp4", opts)).rejects.toThrow(/Credentials/)
    await expect(safeDownload("https://evil.example/a.mp4", opts)).rejects.toThrow(/not an allowed/)
    await expect(safeDownload("https://vm.runware.ai.evil.example/a.mp4", opts)).rejects.toThrow(/not an allowed/)
    await expect(safeDownload("https://vm.runware.ai/a.mp4", { ...opts, resolve: async () => ["169.254.169.254"] })).rejects.toThrow(/private address/)
    expect(f.urls).toHaveLength(0)
  })

  it("checks every redirect hop", async () => {
    const f = fetchOf([new Response(null, { status: 302, headers: { location: "https://metadata.internal/latest" } })])
    await expect(
      safeDownload("https://vm.runware.ai/a.mp4", { allowedHosts: ALLOWED, maxBytes: 1000, fetchImpl: f.impl, resolve: publicDns }),
    ).rejects.toThrow(/not an allowed/)
    expect(f.urls).toHaveLength(1)
  })

  it("stops oversized downloads", async () => {
    const declared = fetchOf([new Response("x", { status: 200, headers: { "content-length": "5000" } })])
    await expect(
      safeDownload("https://vm.runware.ai/a.mp4", { allowedHosts: ALLOWED, maxBytes: 1000, fetchImpl: declared.impl, resolve: publicDns }),
    ).rejects.toThrow(/larger/)
    const streamed = fetchOf([new Response("y".repeat(2000), { status: 200 })])
    await expect(
      safeDownload("https://vm.runware.ai/a.mp4", { allowedHosts: ALLOWED, maxBytes: 1000, fetchImpl: streamed.impl, resolve: publicDns }),
    ).rejects.toThrow(/larger/)
  })
})
