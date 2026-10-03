import { UnsupportedValidationCorrection } from "@repo/validation";
import { env } from "../config/env.js";
export async function validationRequest(
  path: string,
  body: object,
): Promise<unknown> {
  const response = await fetch(`${env.ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/iterate" ? 240000 : 1800000),
  });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    if (
      response.status === 422 &&
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "UNSUPPORTED_VALIDATION_CORRECTION"
    )
      throw new UnsupportedValidationCorrection(
        "The remaining issues cannot be corrected through content-only iteration",
      );
    throw new Error(`Validation ${path} failed (HTTP ${response.status})`);
  }
  return response.json() as Promise<unknown>;
}
