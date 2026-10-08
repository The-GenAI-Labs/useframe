import { describe, expect, it } from "vitest"
import { assertSafeUrl, htmlToText, isBlockedAddress, safeFetchText, UnsafeUrlError } from "./safeFetch.js"

const publicLookup = async (host: string) => {
  const table: Record<string, string> = {
    "public.example.com": "93.184.216.34",
    "internal.example.com": "10.0.0.5",
    "rebind.example.com": "169.254.169.254",
  }
  const address = table[host]
  return address ? [{ address, family: 4 }] : []
}

const page = (body: string) => ({
  status: 200,
  headers: { "content-type": "text/html; charset=utf-8" },
  body: Buffer.from(body),
})

describe("safeFetch SSRF guards", () => {
  it("rejects private, loopback, metadata and odd destinations up front", () => {
    for (const url of [
      "http://127.0.0.1",
      "https://127.0.0.1/admin",
      "http://169.254.169.254/latest/meta-data/",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://localhost/",
      "file:///etc/passwd",
      "ftp://public.example.com/",
      "javascript:alert(1)",
      "https://public.example.com:22/",
      "https://user:pass@public.example.com/",
    ]) {
      expect(() => assertSafeUrl(url), url).toThrow(UnsafeUrlError)
    }
    expect(assertSafeUrl("http://public.example.com/x").protocol).toBe("https:")
  })

  it("classifies addresses", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "192.168.1.1", "127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "100.64.0.1", "::1", "fe80::1", "fd00::1", "ff02::1", "::ffff:10.0.0.1", "64:ff9b::a00:1"]) {
      expect(isBlockedAddress(ip), ip).toBe(true)
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
      expect(isBlockedAddress(ip), ip).toBe(false)
    }
  })

  it("blocks a hostname that resolves to a private address", async () => {
    await expect(
      safeFetchText("https://internal.example.com/", { lookup: publicLookup, request: async () => page("x") }),
    ).rejects.toThrow(UnsafeUrlError)
  })

  it("re-checks every redirect hop", async () => {
    const toPrivateIp = async () => ({ status: 302, headers: { location: "http://192.168.1.10/" }, body: Buffer.alloc(0) })
    await expect(safeFetchText("https://public.example.com/", { lookup: publicLookup, request: toPrivateIp })).rejects.toThrow(UnsafeUrlError)

    const toMetadataHost = async () => ({ status: 301, headers: { location: "https://rebind.example.com/" }, body: Buffer.alloc(0) })
    await expect(safeFetchText("https://public.example.com/", { lookup: publicLookup, request: toMetadataHost })).rejects.toThrow(UnsafeUrlError)
  })

  it("stops after three redirects", async () => {
    let hops = 0
    const loop = async () => {
      hops++
      return { status: 302, headers: { location: "https://public.example.com/next" }, body: Buffer.alloc(0) }
    }
    await expect(safeFetchText("https://public.example.com/", { lookup: publicLookup, request: loop })).rejects.toThrow(UnsafeUrlError)
    expect(hops).toBe(4)
  })

  it("connects to the validated address and returns text only", async () => {
    let connected = ""
    const result = await safeFetchText("https://public.example.com/", {
      lookup: publicLookup,
      request: async (_url, address) => {
        connected = address
        return page("<html><head><title>Ledgerly</title><script>steal()</script></head><body><h1>Books</h1><p>Done fast</p></body></html>")
      },
    })
    expect(connected).toBe("93.184.216.34")
    const text = htmlToText(result.body)
    expect(text).toContain("Ledgerly")
    expect(text).toContain("Books")
    expect(text).not.toContain("steal")
  })

  it("refuses non-page content", async () => {
    await expect(
      safeFetchText("https://public.example.com/", {
        lookup: publicLookup,
        request: async () => ({ status: 200, headers: { "content-type": "application/octet-stream" }, body: Buffer.from("x") }),
      }),
    ).rejects.toThrow(UnsafeUrlError)
  })
})
