// Plain JS with no Node or browser APIs so both Node and k6 can import it.

const ALWAYS_ALLOWED = ["localhost", "127.0.0.1", "::1"];

export function hostOf(url) {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]+\]|[^:/?#]+)/i.exec(url ?? "");
  return match ? match[1].replace(/^\[|\]$/g, "").toLowerCase() : null;
}

export function allowedHosts(extra) {
  const listed = (extra ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...ALWAYS_ALLOWED, ...listed];
}

// Throws unless every target is localhost or listed in ALLOWED_TARGET_HOSTS.
export function assertSafeTargets(targets, allowedExtra) {
  const allowed = allowedHosts(allowedExtra);
  const problems = Object.entries(targets)
    .filter(([, url]) => url)
    .map(([name, url]) => [name, hostOf(url)])
    .filter(([, host]) => !host || !allowed.includes(host))
    .map(([name, host]) => `${name} -> ${host ?? "unparseable URL"}`);
  if (problems.length) {
    throw new Error(
      `Refusing to run: ${problems.join(", ")} is not localhost or in ALLOWED_TARGET_HOSTS. ` +
        "These suites run only against local or staging environments.",
    );
  }
}

export function isLocal(url) {
  return ALWAYS_ALLOWED.includes(hostOf(url) ?? "");
}
