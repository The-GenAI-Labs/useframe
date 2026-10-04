export const FAILURES = {
  ownership_timeout: { retryable: true, message: "We never found the verification record." },
  routing_timeout: { retryable: true, message: "The routing record never pointed to UseFrame." },
  quota: {
    retryable: true,
    message: "Custom domains are temporarily unavailable. Please try again later.",
  },
  provider_error: {
    retryable: true,
    message: "Something went wrong while setting up the domain. Please retry.",
  },
  hostname_conflict: {
    retryable: false,
    message: "This domain is already attached to another UseFrame project.",
  },
  blocked: { retryable: false, message: "This domain can't be connected. Contact support." },
  invalid_hostname: { retryable: false, message: "This domain can't be used for a website." },
} as const;

export type FailureCode = keyof typeof FAILURES;

export function isRetryable(code: string | null): boolean {
  return !!code && code in FAILURES && FAILURES[code as FailureCode].retryable;
}
