export function isFreeTierExhausted(err: unknown): boolean {
    return err instanceof Error && (err as Error & { code?: string }).code === "FREE_TIER_EXHAUSTED";
}
