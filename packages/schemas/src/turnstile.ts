// Server-side verification for Cloudflare Turnstile. The widget "passing" in
// the browser proves nothing on its own — a client can always skip loading it
// or fabricate a token. This siteverify round-trip against Cloudflare is the
// only step that actually gates the request; treat it as mandatory, never as
// a bonus check layered on top of the client-side result.
export interface TurnstileVerifyResult {
  success: boolean
  errorCodes?: string[]
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  secretKey: string,
  remoteIp?: string
): Promise<TurnstileVerifyResult> {
  if (!token) return { success: false, errorCodes: ["missing-input-response"] }

  const body = new URLSearchParams({ secret: secretKey, response: token })
  if (remoteIp) body.set("remoteip", remoteIp)

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) return { success: false, errorCodes: ["siteverify_unreachable"] }

  const data = (await res.json()) as { success: boolean; "error-codes"?: string[] }
  return { success: data.success === true, errorCodes: data["error-codes"] }
}
