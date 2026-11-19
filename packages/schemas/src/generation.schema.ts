import { z } from "zod";
import type { Section, SectionType, SiteSpec } from "./siteSpec.js";
import { SECTION_VARIANTS } from "./theme.schema.js";

// Proven Google Font pairings (every family ships 400-700). The model picks
// an id; code maps it onto designSystem fonts.
export const FONT_PAIRINGS = [
  { id: "fraunces-inter", heading: "Fraunces", body: "Inter", mood: "warm editorial; premium consumer, food, hospitality" },
  { id: "playfair-source-sans", heading: "Playfair Display", body: "Source Sans 3", mood: "classic luxury; fashion, jewellery, boutique" },
  { id: "cormorant-jost", heading: "Cormorant Garamond", body: "Jost", mood: "quiet high luxury; beauty, craft, ateliers" },
  { id: "newsreader-inter", heading: "Newsreader", body: "Inter", mood: "editorial authority; legal, publishing, consulting" },
  { id: "plex-serif-plex-sans", heading: "IBM Plex Serif", body: "IBM Plex Sans", mood: "sober and trustworthy; finance, insurance, enterprise" },
  { id: "lora-work-sans", heading: "Lora", body: "Work Sans", mood: "gentle and human; non-profit, wellness, therapy" },
  { id: "space-grotesk-inter", heading: "Space Grotesk", body: "Inter", mood: "technical and precise; developer tools, AI, infrastructure" },
  { id: "manrope-inter", heading: "Manrope", body: "Inter", mood: "modern and calm; SaaS, fintech, productivity" },
  { id: "plus-jakarta-inter", heading: "Plus Jakarta Sans", body: "Inter", mood: "friendly and polished; B2B SaaS, marketplaces" },
  { id: "bricolage-inter", heading: "Bricolage Grotesque", body: "Inter", mood: "characterful and creative; agencies, studios, creator tools" },
  { id: "outfit-inter", heading: "Outfit", body: "Inter", mood: "bold and energetic; fitness, sport, consumer apps" },
  { id: "archivo-inter", heading: "Archivo", body: "Inter", mood: "strong and direct; trades, logistics, industrial" },
  { id: "fredoka-nunito", heading: "Fredoka", body: "Nunito", mood: "playful and soft; kids, family, education" },
  { id: "lexend-source-sans", heading: "Lexend", body: "Source Sans 3", mood: "highly legible and reassuring; healthcare, seniors, public services" },
] as const;

export type FontPairing = (typeof FONT_PAIRINGS)[number];
export type FontPairingId = FontPairing["id"];
export const FONT_PAIRING_IDS = FONT_PAIRINGS.map((p) => p.id) as [FontPairingId, ...FontPairingId[]];

export function fontPairingById(id: string | undefined): FontPairing | undefined {
  return FONT_PAIRINGS.find((p) => p.id === id);
}

// Hard limits the copy prompt states and code enforces.
export const COPY_LIMITS = {
  eyebrow: 32,
  h1: 70,
  headline: 64,
  subheadline: 160,
  body: 280,
  ctaChars: 28,
  ctaMinWords: 2,
  ctaMaxWords: 4,
  itemTitle: 40,
  itemDescription: 140,
  faqQuestion: 90,
  faqAnswer: 300,
} as const;

export const BANNED_PHRASES = [
  "revolutionize",
  "revolutionise",
  "revolutionary",
  "unlock the power",
  "unlock your potential",
  "seamless",
  "seamlessly",
  "cutting-edge",
  "cutting edge",
  "game-changer",
  "game changer",
  "game-changing",
  "in today's fast-paced world",
  "fast-paced world",
  "elevate",
  "elevates",
  "elevated",
  "elevating",
  "supercharge",
  "next-level",
  "next level",
  "world-class",
  "best-in-class",
  "state-of-the-art",
  "synergy",
  "harness the power",
  "unleash",
  "one-stop shop",
  "look no further",
  "take it to the next level",
  "empower",
  "empowering",
  "leverage",
] as const;

const BANNED_RE = new RegExp(
  `(?:^|[^\\p{L}])(${BANNED_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s]/g, "[-\\s]")).join("|")})(?=$|[^\\p{L}])`,
  "iu",
);

export function bannedPhraseIn(text: string): string | null {
  const m = BANNED_RE.exec(text.replace(/[’]/g, "'"));
  return m ? m[1]!.toLowerCase() : null;
}

const SECTION_TYPE_WORDS = "hero|features?|how[_ ]it[_ ]works|testimonials?|pricing|cta|faq|team|contact|header|footer|custom|stats|logos";
const PLACEHOLDERS = [
  /\blorem\b|\bipsum\b/i,
  new RegExp(`^\\s*(?:${SECTION_TYPE_WORDS})\\s+section\\s*$`, "i"),
  /\b(?:TBD|TODO|placeholder)\b/i,
  /\[[^\]]*\]/,
  /\{\{|\}\}|<[^>]+>/,
  /\b(?:your|company|product|brand)\s+name\s+here\b/i,
  /^\s*(?:headline|subheadline|title|description|string|text|body|cta|button)\s*$/i,
  /\bundefined\b|\bnull\b|\bNaN\b/,
];

export function isPlaceholder(text: string): boolean {
  return PLACEHOLDERS.some((re) => re.test(text));
}

const CLAIM_PATTERNS = [
  /\d[\d,.]*\s*(?:k|m|\+)*\+?\s+(?:happy |satisfied |active |paying )?(?:customers|users|teams|clients|companies|businesses|brands|people|members|students|patients|families|downloads|reviews|installs|subscribers|merchants|developers|parents|learners|homes|athletes)\b/i,
  /\b\d{1,3}(?:\.\d+)?\s?%/,
  /\b\d(?:\.\d)?\s*(?:\/\s*5|out of 5|stars?)\b/i,
  /\b(?:award[- ]winning|awarded|certified|accredited|#1|number one|top[- ]rated|trusted by|as seen (?:in|on)|featured in|loved by)\b/i,
];

// Proof-shaped claims (counts of customers, percentages, ratings, awards)
// that the facts don't contain. Facts are the brief/request text.
export function inventedClaims(text: string, facts: string): string[] {
  const haystack = facts.toLowerCase();
  const out: string[] = [];
  for (const re of CLAIM_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const claim = m[0].trim();
    const digits = claim.match(/\d[\d,.]*/)?.[0];
    if (haystack.includes(claim.toLowerCase())) continue;
    if (digits && haystack.includes(digits)) continue;
    out.push(claim);
  }
  return out;
}

export type ItemRule = { min: number; max: number; titleMax: number; descriptionMax: number };
export type ContentContract = {
  headlineMax: number;
  subheadline: "required" | "optional" | "none";
  body: "optional" | "none";
  eyebrow: boolean;
  cta: "required" | "optional" | "none";
  items?: ItemRule;
};

const FEATURE_ITEMS: ItemRule = { min: 3, max: 6, titleMax: COPY_LIMITS.itemTitle, descriptionMax: COPY_LIMITS.itemDescription };
const BASE: ContentContract = { headlineMax: COPY_LIMITS.headline, subheadline: "optional", body: "none", eyebrow: true, cta: "none" };

// What each section type (and variant) needs from the copywriter. Proof
// sections are filled from brief facts, never written.
export function contentContract(type: SectionType, variant?: string): ContentContract {
  switch (type) {
    case "HERO":
      return { ...BASE, headlineMax: COPY_LIMITS.h1, subheadline: "required", cta: "required" };
    case "FEATURES":
      return {
        ...BASE,
        items:
          variant === "bento"
            ? { ...FEATURE_ITEMS, min: 4, max: 6 }
            : variant === "alternating"
              ? { ...FEATURE_ITEMS, min: 2, max: 4 }
              : FEATURE_ITEMS,
      };
    case "HOW_IT_WORKS":
      return { ...BASE, items: { min: 3, max: 5, titleMax: COPY_LIMITS.itemTitle, descriptionMax: COPY_LIMITS.itemDescription } };
    case "FAQ":
      return { ...BASE, eyebrow: false, items: { min: 4, max: 6, titleMax: COPY_LIMITS.faqQuestion, descriptionMax: COPY_LIMITS.faqAnswer } };
    case "CTA":
      return { ...BASE, eyebrow: false, subheadline: "optional", cta: "required" };
    case "CONTACT":
      return { ...BASE, eyebrow: false, cta: "optional" };
    case "CUSTOM":
      return { ...BASE, body: "optional" };
    case "HEADER":
    case "FOOTER":
      return { headlineMax: 40, subheadline: "none", body: "none", eyebrow: false, cta: "none" };
    default:
      return { ...BASE, items: { min: 1, max: 6, titleMax: 80, descriptionMax: 400 } };
  }
}

// Section types whose content comes only from user-provided brief facts.
export const PROOF_SECTION_TYPES: SectionType[] = ["TESTIMONIALS", "LOGOS", "STATS", "PRICING", "TEAM"];
export const WRITTEN_SECTION_TYPES: SectionType[] = ["HERO", "FEATURES", "HOW_IT_WORKS", "FAQ", "CTA", "CONTACT", "CUSTOM"];

export const SECTION_PURPOSES: Record<SectionType, string> = {
  HEADER: "Lets visitors orient and reach the main action from anywhere.",
  HERO: "Says what it is, who it is for and why it is better within five seconds.",
  LOGOS: "Shows real organisations that already use the product.",
  STATS: "Backs the promise with real numbers the user supplied.",
  FEATURES: "Turns the promise into concrete capabilities and their benefits.",
  HOW_IT_WORKS: "Shows how little effort it takes to get started.",
  TESTIMONIALS: "Lets real customers vouch for the outcome.",
  PRICING: "Answers what it costs with the user's real plans.",
  FAQ: "Removes the last objections: price, setup, privacy, cancelling, fit.",
  CTA: "Asks for the primary action once more, with the main benefit.",
  TEAM: "Puts real faces behind the product.",
  CONTACT: "Gives a direct way to reach a person.",
  FOOTER: "Closes the page with navigation and legal basics.",
  CUSTOM: "Explains why this beats how people solve it today, from the user's own differentiators.",
};

export function isVariantOf(type: SectionType, variant: string | undefined): boolean {
  return !!variant && ((SECTION_VARIANTS as Record<string, readonly string[]>)[type] ?? []).includes(variant);
}

// Variants that read as the same layout; two in a row look repetitive.
const LAYOUT_FAMILIES: Record<string, string> = {
  "FEATURES.grid": "cards",
  "TESTIMONIALS.cards": "cards",
  "TEAM.grid": "cards",
  "STATS.cards": "cards",
  "HOW_IT_WORKS.steps": "cards",
  "PRICING.tiers": "cards",
  "FEATURES.list": "split",
  "FAQ.two-column": "split",
  "CTA.split": "split",
  "FEATURES.alternating": "rows",
  "PRICING.simple": "rows",
  "HOW_IT_WORKS.timeline": "rows",
};

export function layoutFamily(type: SectionType, variant: string | undefined): string | null {
  return variant ? (LAYOUT_FAMILIES[`${type}.${variant}`] ?? null) : null;
}

export function repeatsLayout(prev: Pick<Section, "type" | "variant"> | undefined, section: Pick<Section, "type" | "variant"> | undefined): boolean {
  if (!prev || !section?.variant) return false;
  if (prev.type === section.type && prev.variant === section.variant) return true;
  const family = layoutFamily(section.type, section.variant);
  return !!family && family === layoutFamily(prev.type, prev.variant);
}

export type QualityIssue = { code: string; path: string; detail: string };

type Content = NonNullable<Section["content"]>;

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);

function checkText(issues: QualityIssue[], path: string, value: string | undefined, max: number, facts: string, required = false): void {
  if (value === undefined || value.trim() === "") {
    if (required) issues.push({ code: "missing", path, detail: "required" });
    return;
  }
  if (value.length > max) issues.push({ code: "limit", path, detail: `${value.length} > ${max} characters` });
  if (isPlaceholder(value)) issues.push({ code: "placeholder", path, detail: "placeholder text" });
  const banned = bannedPhraseIn(value);
  if (banned) issues.push({ code: "banned", path, detail: `banned phrase "${banned}"` });
  for (const claim of inventedClaims(value, facts)) issues.push({ code: "invented_proof", path, detail: `unsupported claim "${claim}"` });
}

export function checkCta(issues: QualityIssue[], path: string, label: string | undefined, required: boolean): void {
  if (!label?.trim()) {
    if (required) issues.push({ code: "missing", path, detail: "required" });
    return;
  }
  const n = words(label).length;
  if (n < COPY_LIMITS.ctaMinWords || n > COPY_LIMITS.ctaMaxWords || label.length > COPY_LIMITS.ctaChars) {
    issues.push({ code: "limit", path, detail: `CTA must be ${COPY_LIMITS.ctaMinWords}-${COPY_LIMITS.ctaMaxWords} words` });
  }
  if (isPlaceholder(label)) issues.push({ code: "placeholder", path, detail: "placeholder text" });
  const banned = bannedPhraseIn(label);
  if (banned) issues.push({ code: "banned", path, detail: `banned phrase "${banned}"` });
}

// Validates written copy for one section against its contract.
const STOPWORDS = new Set("a an and are as at be but by can for from has have how in into is it its more no not of on or our so than that the their them then they this to up was we what when which who will with you your".split(" "));

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => w.replace(/(ies|es|s)$/, "")),
  );
}

// Share of the shorter text's content words that the longer one repeats.
export function overlapRatio(a: string, b: string): number {
  const x = contentWords(a);
  const y = contentWords(b);
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  if (small.size < 2) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

const RESTATED = 0.75;

// True when the cited basis really comes from the facts: most of its content
// words appear there. Lets code verify a claim instead of trusting the model.
export function groundedIn(basis: string | undefined, facts: string): boolean {
  if (!basis?.trim()) return false;
  const words = contentWords(basis);
  if (words.size === 0) return false;
  const factWords = contentWords(facts);
  let found = 0;
  for (const w of words) if (factWords.has(w)) found++;
  return found / words.size >= 0.6;
}

export function checkSectionContent(type: SectionType, variant: string | undefined, content: Content | undefined, facts: string, prefix = ""): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const contract = contentContract(type, variant);
  const c = content ?? {};
  const p = (field: string) => `${prefix}${field}`;
  if (type === "HEADER" || type === "FOOTER") return issues;
  checkText(issues, p("headline"), c.headline, contract.headlineMax, facts, true);
  checkText(issues, p("subheadline"), c.subheadline, COPY_LIMITS.subheadline, facts, contract.subheadline === "required");
  checkText(issues, p("body"), c.body, COPY_LIMITS.body * (type === "CUSTOM" ? 2 : 1), facts);
  checkText(issues, p("eyebrow"), c.eyebrow, COPY_LIMITS.eyebrow, facts);
  if (c.headline && c.subheadline && overlapRatio(c.headline, c.subheadline) >= RESTATED) {
    issues.push({ code: "restated", path: p("subheadline"), detail: "subheadline repeats the headline; add new information" });
  }
  if (contract.cta !== "none") {
    checkCta(issues, p("cta.primary"), c.cta?.primary, contract.cta === "required");
    checkCta(issues, p("cta.secondary"), c.cta?.secondary, false);
  }
  if (contract.items) {
    const items = c.items ?? [];
    if (items.length < contract.items.min || items.length > contract.items.max) {
      issues.push({ code: "items", path: p("items"), detail: `needs ${contract.items.min}-${contract.items.max} items, got ${items.length}` });
    }
    items.forEach((item, i) => {
      checkText(issues, p(`items.${i}.title`), item.title, contract.items!.titleMax, facts, true);
      checkText(issues, p(`items.${i}.description`), item.description, contract.items!.descriptionMax, facts, true);
      if (item.title && item.description && type !== "FAQ" && overlapRatio(item.title, item.description) >= RESTATED && contentWords(item.description).size <= contentWords(item.title).size + 2) {
        issues.push({ code: "restated", path: p(`items.${i}.description`), detail: "description only repeats the title" });
      }
    });
  }
  return issues;
}

const opening = (headline: string) => words(headline.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "")).slice(0, 2).join(" ");

export type SpecQualityOptions = {
  facts: string;
  // Proof the user actually supplied; proof sections without it are invented.
  proof?: Partial<Record<"testimonials" | "metrics" | "trustedBy" | "pricingPlans", boolean>>;
};

const PROOF_NEEDS: Partial<Record<SectionType, "testimonials" | "metrics" | "trustedBy" | "pricingPlans" | "never">> = {
  TESTIMONIALS: "testimonials",
  STATS: "metrics",
  LOGOS: "trustedBy",
  PRICING: "pricingPlans",
  TEAM: "never",
};

// Whole-spec checks: per-section contracts plus repetition, rhythm, CTA
// consistency and proof honesty.
export function checkSpecQuality(spec: Pick<SiteSpec, "pages">, opts: SpecQualityOptions): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const headlines = new Map<string, string>();
  const openings = new Map<string, string>();
  const ctaLabels = new Set<string>();
  for (const page of spec.pages) {
    for (const [i, section] of page.sections.entries()) {
      const at = `${page.slug}.${i}.${section.type}`;
      const need = PROOF_NEEDS[section.type];
      if (need && (need === "never" || !opts.proof?.[need])) {
        issues.push({ code: "invented_proof", path: at, detail: `${section.type} without user-provided facts` });
      }
      if (!PROOF_SECTION_TYPES.includes(section.type)) {
        issues.push(...checkSectionContent(section.type, section.variant, section.content, opts.facts, `${at}.`));
      }
      const h = section.content?.headline?.trim();
      if (h && section.type !== "HEADER" && section.type !== "FOOTER") {
        const key = h.toLowerCase();
        if (headlines.has(key)) issues.push({ code: "duplicate_headline", path: `${at}.headline`, detail: `same as ${headlines.get(key)}` });
        headlines.set(key, at);
        const open = opening(h);
        if (open.split(" ").length === 2 && openings.has(open)) {
          issues.push({ code: "repeated_opening", path: `${at}.headline`, detail: `starts like ${openings.get(open)}` });
        }
        openings.set(open, at);
      }
      if ((section.type === "HERO" || section.type === "CTA") && section.content?.cta?.primary) ctaLabels.add(section.content.cta.primary.trim().toLowerCase());
      if (repeatsLayout(page.sections[i - 1], section)) {
        issues.push({ code: "adjacent_variant", path: `${at}.variant`, detail: "same layout as the section before" });
      }
    }
  }
  if (ctaLabels.size > 1) issues.push({ code: "cta_inconsistent", path: "cta.primary", detail: `${ctaLabels.size} different primary CTA labels` });
  return issues;
}

export const QualityIssueSchema = z.object({ code: z.string(), path: z.string(), detail: z.string() });
