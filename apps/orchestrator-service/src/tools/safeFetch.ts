import { lookup as dnsLookup } from "node:dns/promises"
import https from "node:https"
import net from "node:net"

// SSRF-safe page fetch for brief pre-fill. The existing Playwright capture
// has no destination checks, so pre-fill does not reuse it.

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeUrlError"
  }
}

export const SAFE_FETCH_USER_AGENT = "UseFrameBriefBot/1.0 (+https://useframe.so)"

type Lookup = (hostname: string) => Promise<{ address: string; family: number }[]>
type RawResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }
type Requester = (url: URL, address: string, signal: AbortSignal, maxBytes: number) => Promise<RawResponse>

export type SafeFetchOptions = {
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  signal?: AbortSignal
  lookup?: Lookup
  request?: Requester
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

function expandV6(ip: string): number[] | null {
  let addr = ip.toLowerCase().split("%")[0]!
  const v4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (v4Tail) {
    const n = ipv4ToInt(v4Tail[1]!)
    addr = addr.replace(v4Tail[1]!, `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`)
  }
  const [head, tail] = addr.split("::") as [string, string | undefined]
  const headParts = head ? head.split(":") : []
  const tailParts = tail ? tail.split(":") : []
  const fill = addr.includes("::") ? 8 - headParts.length - tailParts.length : 0
  if (fill < 0) return null
  const parts = [...headParts, ...Array(fill).fill("0"), ...tailParts]
  if (parts.length !== 8) return null
  return parts.map((p) => parseInt(p || "0", 16))
}

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return BLOCKED_V4.some(([base, bits]) => inV4Range(ip, base, bits))
  if (!net.isIPv6(ip)) return true
  const w = expandV6(ip)
  if (!w) return true
  const allZeroPrefix = w.slice(0, 5).every((x) => x === 0)
  // ::ffff:a.b.c.d and ::a.b.c.d embed an IPv4 address; judge that instead.
  if (allZeroPrefix && (w[5] === 0xffff || w[5] === 0)) {
    if (w[5] === 0 && w[6] === 0 && (w[7] === 0 || w[7] === 1)) return true
    const v4 = `${w[6]! >> 8}.${w[6]! & 0xff}.${w[7]! >> 8}.${w[7]! & 0xff}`
    return isBlockedAddress(v4)
  }
  const first = w[0]!
  if ((first & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return true // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return true // multicast ff00::/8
  if (first === 0x2001 && w[1] === 0x0db8) return true // documentation
  if (first === 0x0064 && w[1] === 0xff9b) return true // NAT64 can reach IPv4 internals
  if (first === 0x2002) return true // 6to4
  return false
}

export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new UnsafeUrlError("That isn't a valid link")
  }
  if (url.protocol === "http:") url.protocol = "https:"
  if (url.protocol !== "https:") throw new UnsafeUrlError("Only https links are supported")
  if (url.username || url.password) throw new UnsafeUrlError("Links with credentials aren't supported")
  if (url.port && url.port !== "443") throw new UnsafeUrlError("Only standard web ports are supported")
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError("That address isn't reachable")
  }
  if (net.isIP(host) && isBlockedAddress(host)) throw new UnsafeUrlError("That address isn't reachable")
  return url
}

const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true, verbatim: true })

async function resolvePinned(url: URL, lookup: Lookup): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) return host
  const addresses = await lookup(host).catch(() => [])
  if (addresses.length === 0) throw new UnsafeUrlError("That site couldn't be found")
  if (addresses.some((a) => isBlockedAddress(a.address))) throw new UnsafeUrlError("That address isn't reachable")
  return addresses[0]!.address
}

// Connects to the already-validated IP (no second DNS lookup, so no
// rebinding window) while still verifying TLS against the hostname.
const defaultRequest: Requester = (url, address, signal, maxBytes) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: address,
        servername: net.isIP(url.hostname) ? undefined : url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        signal,
        headers: {
          Host: url.host,
          "User-Agent": SAFE_FETCH_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "Accept-Encoding": "identity",
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (chunk: Buffer) => {
          size += chunk.length
          if (size > maxBytes) {
            chunks.push(chunk.subarray(0, Math.max(0, chunk.length - (size - maxBytes))))
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) })
        res.on("end", done)
        res.on("close", done)
        res.on("error", reject)
      },
    )
    req.on("error", reject)
    req.end()
  })

export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<{ url: string; contentType: string; body: string }> {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 15_000)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
  const lookup = opts.lookup ?? defaultLookup
  const request = opts.request ?? defaultRequest
  const maxBytes = opts.maxBytes ?? 2 * 1024 * 1024
  const maxRedirects = opts.maxRedirects ?? 3

  let url = assertSafeUrl(rawUrl)
  for (let hop = 0; ; hop++) {
    const address = await resolvePinned(url, lookup)
    const res = await request(url, address, signal, maxBytes)

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location
      if (typeof location !== "string" || hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects")
      url = assertSafeUrl(new URL(location, url).toString())
      continue
    }
    if (res.status < 200 || res.status >= 300) throw new UnsafeUrlError("That page couldn't be loaded")

    const contentType = String(res.headers["content-type"] ?? "").toLowerCase()
    if (!/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType)) {
      throw new UnsafeUrlError("That link isn't a web page")
    }
    return { url: url.toString(), contentType, body: res.body.toString("utf8") }
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ""
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

function clean(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
}

// Text only: title, meta description, headings and visible body text.
export function htmlToText(html: string, maxChars = 20_000): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object|embed|canvas|head)\b[\s\S]*?<\/\1\s*>/gi, (m, tag: string) =>
      tag.toLowerCase() === "head" ? m.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ") : " ",
    )
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(stripped)?.[1] ?? "")
  const metaTag = /<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i.exec(stripped)?.[0] ?? ""
  const description = clean(/content\s*=\s*["']([^"']*)["']/i.exec(metaTag)?.[1] ?? "")
  const headings = [...stripped.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => clean(m[2] ?? "")).filter(Boolean)
  const body = clean((/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(stripped)?.[1] ?? stripped).replace(/<head\b[\s\S]*?<\/head>/i, " "))

  return [
    title && `Title: ${title}`,
    description && `Description: ${description}`,
    headings.length > 0 && `Headings: ${headings.slice(0, 40).join(" | ")}`,
    body && `Text: ${body}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, maxChars)
}
