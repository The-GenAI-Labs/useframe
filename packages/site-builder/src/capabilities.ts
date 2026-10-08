// Only capabilities the compiler actually emits. A StyleTag whose
// requiresCapability is not listed here is excluded from every LLM menu.
export const SUPPORTED_CAPABILITIES = [
  "framer_motion",
  "lenis_smooth_scroll",
  "horizontal_scroll",
] as const;
export type Capability = (typeof SUPPORTED_CAPABILITIES)[number];

// Every capability name a catalog entry may reference, including ones the
// compiler doesn't emit yet - lets seeds declare e.g. three_js ahead of
// support without failing validation.
export const KNOWN_CAPABILITIES = [
  ...SUPPORTED_CAPABILITIES,
  "three_js",
  "gsap_scrolltrigger",
] as const;
export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];

// What generated sites can actually do today; the brief uses this to hide
// options (forms, extra languages) and to warn about legal pages.
export const BUILDER_CAPABILITIES = {
  formHandler: false,
  legalPages: false,
  languages: ["en"],
} as const satisfies { formHandler: boolean; legalPages: boolean; languages: readonly string[] };

export function isSupportedCapability(value: string | null | undefined): boolean {
  return !value || (SUPPORTED_CAPABILITIES as readonly string[]).includes(value);
}
