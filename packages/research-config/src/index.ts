import { readFileSync } from "node:fs";
import { validateStyleDirectives, validateStyleTags, type StyleDirectiveSeed, type StyleTagSeed } from "./validate.js";

export * from "./validate.js";

function readSeed(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../seed/${name}`, import.meta.url), "utf8"));
}

export function loadStyleTagSeed(): StyleTagSeed[] {
  return validateStyleTags(readSeed("styleTags.json"));
}

export function loadStyleDirectiveSeed<N extends string>(
  niches: readonly N[],
): Array<Omit<StyleDirectiveSeed, "niche"> & { niche: N }> {
  return validateStyleDirectives(readSeed("styleDirectives.json"), niches);
}
