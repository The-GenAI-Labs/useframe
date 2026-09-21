import disposableDomains from "disposable-email-domains"

// The npm package is community-maintained but new disposable services
// appear faster than any package release cadence — keep a small manual list
// on top. Review this list monthly; it goes stale, the package alone won't
// catch everything.
const MANUAL_ADDITIONS = ["yopmail.com", "yopmail.fr", "yopmail.net", "guerrillamail.info"]

const blockedSet = new Set<string>([...disposableDomains, ...MANUAL_ADDITIONS])

export function isDisposableEmail(email: string): boolean {
    const domain = email.split("@")[1]?.toLowerCase()
    return domain ? blockedSet.has(domain) : false
}
