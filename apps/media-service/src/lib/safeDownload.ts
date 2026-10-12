import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

export class UnsafeDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsafeDownloadError"
  }
}

export function isBlockedAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number]
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    )
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith("::ffff:")) return isBlockedAddress(v6.slice(7))
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff")
}

export type SafeDownloadOptions = {
  allowedHosts: readonly string[]
  maxBytes: number
  timeoutMs?: number
  maxRedirects?: number
  fetchImpl?: typeof fetch
  resolve?: (host: string) => Promise<string[]>
}

const defaultResolve = async (host: string) => (await lookup(host, { all: true })).map((r) => r.address)

function hostAllowed(host: string, allowed: readonly string[]): boolean {
  return allowed.some((h) => host === h || host.endsWith(`.${h}`))
}

// Provider results only: https, an allow-listed host that resolves to a public
// address on every hop, a size cap, and redirects checked one by one.
export async function safeDownload(rawUrl: string, options: SafeDownloadOptions): Promise<Buffer> {
  const doFetch = options.fetchImpl ?? fetch
  const resolve = options.resolve ?? defaultResolve
  let url = rawUrl
  for (let hop = 0; hop <= (options.maxRedirects ?? 3); hop++) {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new UnsafeDownloadError("Invalid download URL")
    }
    if (parsed.protocol !== "https:") throw new UnsafeDownloadError("Downloads must use https")
    if (parsed.username || parsed.password) throw new UnsafeDownloadError("Credentials in URL are not allowed")
    const host = parsed.hostname.toLowerCase()
    if (!hostAllowed(host, options.allowedHosts)) throw new UnsafeDownloadError(`Host ${host} is not an allowed provider host`)
    const addresses = isIP(host) ? [host] : await resolve(host)
    if (addresses.length === 0 || addresses.some(isBlockedAddress)) throw new UnsafeDownloadError(`Host ${host} resolves to a private address`)

    const res = await doFetch(parsed, { redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs ?? 120_000) })
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) throw new UnsafeDownloadError("Redirect without a location")
      url = new URL(location, parsed).toString()
      continue
    }
    if (!res.ok || !res.body) throw new Error(`Download failed with status ${res.status}`)
    const declared = Number(res.headers.get("content-length") ?? "0")
    if (declared > options.maxBytes) throw new UnsafeDownloadError("Download is larger than allowed")
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length
      if (size > options.maxBytes) throw new UnsafeDownloadError("Download is larger than allowed")
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  throw new UnsafeDownloadError("Too many redirects")
}
