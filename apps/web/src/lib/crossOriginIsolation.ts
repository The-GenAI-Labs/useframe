// WebContainers need the COOP/COEP headers from next.config, but those block
// Razorpay's checkout iframe, so /billing is served without them. Headers only
// change on a full page load, so a page reached by client-side navigation from
// the other kind reloads itself once. Returns true when a reload has started.
export function reloadUnlessCrossOriginIsolated(wanted: boolean): boolean {
  if (typeof window === "undefined") return false;
  const key = `coi-reload:${window.location.pathname}`;
  try {
    if (window.crossOriginIsolated === wanted) {
      sessionStorage.removeItem(key);
      return false;
    }
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
