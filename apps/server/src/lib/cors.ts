import type { CorsOptions } from "cors"

// One exact origin, never a pattern: generated sites on *.<base domain> must
// not be able to read API responses with the user's credentials.
export function corsOptions(clientUrl: string): CorsOptions {
  return { origin: new URL(clientUrl).origin, credentials: true }
}
