import { testEnv } from "./env.js";
import { mintMagicLink } from "./fixtures.js";

// POSTs to /api/auth need an allowed Origin, like any browser request from the web app.
export const appOrigin = new URL(testEnv.baseUrl).origin;

export function verifyMagicLink(token: string): Promise<Response> {
  return fetch(`${testEnv.apiUrl}/api/auth/magic-link/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: appOrigin },
    body: JSON.stringify({ token }),
  });
}

export async function accessTokenFor(email: string): Promise<string> {
  const res = await verifyMagicLink(await mintMagicLink(email));
  const body = (await res.json()) as { data?: { accessToken?: string } };
  if (!res.ok || !body.data?.accessToken) throw new Error(`Sign-in for ${email} failed with ${res.status}`);
  return body.data.accessToken;
}
