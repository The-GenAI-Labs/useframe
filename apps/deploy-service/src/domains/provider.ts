// Everything specific to how the edge provider issues and validates certificates
// lives behind this interface (and in instructions.ts for what users are told).
export type CustomHostnameState = {
  id: string;
  hostname: string;
  status: string;
  sslStatus: string | null;
  verificationErrors: string[];
  validationErrors: string[];
  certIssuedAt: Date | null;
  certExpiresAt: Date | null;
};

export type ProviderErrorKind = "duplicate" | "quota" | "invalid" | "not_found" | "transient" | "unknown";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface CustomHostnameProvider {
  create(hostname: string): Promise<CustomHostnameState>;
  findByHostname(hostname: string): Promise<CustomHostnameState | null>;
  /** null when the provider no longer has the hostname. */
  get(id: string): Promise<CustomHostnameState | null>;
  /** Restart certificate/ownership validation; also re-applies our certificate settings. */
  revalidate(id: string): Promise<CustomHostnameState>;
  /** Missing counts as deleted. */
  delete(id: string): Promise<void>;
  count(): Promise<number>;

  isLive(state: CustomHostnameState): boolean;
  isBlocked(state: CustomHostnameState): boolean;
  needsRevalidation(state: CustomHostnameState): boolean;
}
