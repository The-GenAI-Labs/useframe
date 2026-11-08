import { z } from "zod";
import { ResearchCategoryEnum } from "@repo/schemas";
import { parseFindingFile, sha256, type FindingFile } from "./findingFile.js";
import { ArticleFileSchema, type ArticleFile } from "./corpusArticles.js";
import {
  LABEL_BATCH_SIZE,
  assignSlugs,
  checkLabel,
  findingKey,
  offlineLabel,
  slugify,
  type LabelCache,
  type LabelProvider,
} from "./labels.js";

const text = z.union([z.string(), z.number()]).transform(String);
const year = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^\d{1,4}$/)
      .transform(Number),
  ])
  .nullish();

export const RawFindingSchema = z
  .object({
    claim: z.string().refine((v) => v.trim().length > 0, "claim is empty"),
    authors: z.array(z.string()).default([]),
    publicationYear: year,
    publishedIn: z.string().nullish(),
    publicationType: z.string().nullish(),
    sourceUrl: z.string().trim().min(1),
    field: z.string().trim().min(1),
    appliesTo: z.array(z.string()).default([]),
    audience: z.array(z.string()).default([]),
    decision: z.string().nullish(),
    options: z
      .array(
        z
          .object({
            value: text,
            label: text,
            fits: z.array(z.string()).default([]),
          })
          .passthrough(),
      )
      .default([]),
    contextHeader: z.string().nullish(),
    verified: z.boolean().default(false),
  })
  .passthrough();
export type RawFinding = z.infer<typeof RawFindingSchema>;

export const RawArticleSchema = z
  .object({
    title: z.string().trim().min(1),
    category: z.string().trim().min(1),
    summary: z.string(),
    sections: z.array(
      z.object({ heading: z.string(), body: z.string() }).passthrough(),
    ),
    body: z.string(),
    tags: z.array(z.string()).default([]),
    references: z
      .array(
        z
          .object({
            title: z.string().nullish(),
            url: z.string().nullish(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();
export type RawArticle = z.infer<typeof RawArticleSchema>;

export type ParsedBatch =
  | {
      ok: true;
      findings: RawFinding[];
      articles: RawArticle[];
      errors: string[];
    }
  | { ok: false; error: string };

const lineColumn = (source: string, position: number) => {
  const before = source.slice(0, position);
  const line = before.split("\n").length;
  return { line, column: position - (before.lastIndexOf("\n") + 1) + 1 };
};

export function stripFences(raw: string): { body: string; offset: number } {
  let start = raw.charCodeAt(0) === 0xfeff ? 1 : 0;
  let end = raw.length;
  const leading = /^\s*```[\w-]*[ \t]*\r?\n/.exec(raw.slice(start));
  if (leading) start += leading[0].length;
  const trailing = /\s*```\s*$/.exec(raw);
  if (trailing && trailing.index >= start) end = trailing.index;
  return { body: raw.slice(start, end), offset: start };
}

// V8 only reports a position for some syntax errors, so locate it ourselves.
function jsonErrorPosition(source: string): number | null {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const space = () => {
    while (i < source.length && /\s/.test(source[i]!)) i++;
  };
  const expect = (char: string) => {
    if (source[i] !== char) fail();
    i++;
  };
  const string = () => {
    expect('"');
    while (source[i] !== '"') {
      const code = source.charCodeAt(i);
      if (Number.isNaN(code) || code < 0x20) fail();
      i += source[i] === "\\" ? 2 : 1;
    }
    i++;
  };
  const value = (): void => {
    space();
    const char = source[i];
    if (char === "{" || char === "[") {
      const close = char === "{" ? "}" : "]";
      i++;
      space();
      if (source[i] === close) return void i++;
      for (;;) {
        space();
        if (char === "{") {
          string();
          space();
          expect(":");
        }
        value();
        space();
        if (source[i] === ",") i++;
        else return expect(close);
      }
    }
    if (char === '"') return string();
    const literal =
      /true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    literal.lastIndex = i;
    const match = literal.exec(source);
    if (!match) fail();
    i += match![0].length;
  };
  try {
    value();
    space();
    if (i < source.length) fail();
    return null;
  } catch (position) {
    return typeof position === "number" ? position : null;
  }
}

export function parseRawBatch(raw: string): ParsedBatch {
  const { body, offset } = stripFences(raw);
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const position = jsonErrorPosition(body);
    if (position === null)
      return { ok: false, error: `parse error: ${message}` };
    const { line, column } = lineColumn(raw, offset + position);
    return {
      ok: false,
      error: `parse error at line ${line}, column ${column}: ${message}`,
    };
  }
  const shape = z
    .object({
      findings: z.array(z.unknown()).default([]),
      articles: z.array(z.unknown()).default([]),
    })
    .passthrough()
    .safeParse(data);
  if (!shape.success)
    return {
      ok: false,
      error: `schema error: expected { findings: [], articles: [] } (${shape.error.issues[0]?.message ?? "invalid"})`,
    };
  const errors: string[] = [];
  const collect = <S extends z.ZodTypeAny>(
    items: unknown[],
    schema: S,
    name: string,
  ) =>
    items.flatMap((item, index) => {
      const parsed = schema.safeParse(item);
      if (parsed.success) return [parsed.data as z.output<S>];
      const issue = parsed.error.issues[0];
      errors.push(
        `${name}[${index}]: ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`,
      );
      return [];
    });
  return {
    ok: true,
    findings: collect(shape.data.findings, RawFindingSchema, "findings"),
    articles: collect(shape.data.articles, RawArticleSchema, "articles"),
    errors,
  };
}

const humanize = (value: string) => value.replace(/_/g, " ");
const kebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export function buildStatement(
  claim: string,
  options: RawFinding["options"],
): string {
  if (!options.length) return claim;
  const lines = options.map((o) => {
    const fits = o.fits.map(humanize).join(", ");
    return `- ${o.label}: ${o.value}${fits ? ` (fits: ${fits})` : ""}`;
  });
  return `${claim}\n\nOptions:\n${lines.join("\n")}`;
}

export function buildAppliesWhen(
  appliesTo: string[],
  audience: string[],
): string | undefined {
  const join = (values: string[]) => values.map(humanize).join(", ");
  const parts = [
    appliesTo.length ? `Applies to: ${join(appliesTo)}.` : "",
    audience.length ? `Audience: ${join(audience)}.` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
}

export function buildTags(
  field: string,
  decision: string | null | undefined,
  options: RawFinding["options"],
): string[] {
  const counts = new Map<string, number>();
  for (const option of options)
    for (const fit of new Set(option.fits.map(kebab).filter(Boolean)))
      counts.set(fit, (counts.get(fit) ?? 0) + 1);
  const fits = [...counts].sort(
    ([a, x], [b, y]) => y - x || (a < b ? -1 : a > b ? 1 : 0),
  );
  const ordered = [
    kebab(field),
    kebab(decision ?? ""),
    ...fits.map(([t]) => t),
  ];
  return [...new Set(ordered.filter(Boolean))].slice(0, 12);
}

export function mapCategory(field: string): FindingFile["category"] | null {
  const parsed = ResearchCategoryEnum.safeParse(
    field
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, ""),
  );
  return parsed.success ? parsed.data : null;
}

export function extractDoi(url: string): string | undefined {
  return /10\.\d{4,9}\/[^\s"?#]+/.exec(url)?.[0];
}

const normalizeUrl = (url: string) => url.split("#")[0]!.replace(/\/+$/, "");

export interface ReferenceEntry {
  title: string;
  url: string;
}
export function matchReference(
  sourceUrl: string,
  references: ReferenceEntry[],
): { title: string | null; titles: string[] } {
  let hits = references.filter((r) => r.url === sourceUrl);
  if (!hits.length) {
    const wanted = normalizeUrl(sourceUrl);
    hits = references.filter((r) => normalizeUrl(r.url) === wanted);
  }
  const titles = [...new Set(hits.map((h) => h.title))];
  return { title: titles[0] ?? null, titles };
}

export interface ConvertedFinding {
  key: string;
  file: string;
  slug: string;
  title: string;
  labelSource: "cache" | "model" | "offline";
  output: FindingFile;
  sourceTitle: string | null;
  reasons: string[];
  flags: string[];
  sourceUrl: string;
  claim: string;
}
export interface ConvertedArticle {
  key: string;
  file: string;
  slug: string;
  output: ArticleFile;
}
export interface Problems {
  duplicateClaims: Array<{ claim: string; files: string[] }>;
  sharedSources: Array<{ url: string; slugs: string[] }>;
  nearDuplicates: Array<{ a: string; b: string; similarity: number }>;
  downgraded: Array<{ slug: string; reasons: string[] }>;
  fewOptions: Array<{ slug: string; count: number }>;
  multipleTitles: Array<{ slug: string; titles: string[] }>;
  unmatchedReferences: Array<{ article: string; reference: string }>;
}
export interface ConvertResult {
  findingsIn: number;
  articlesIn: number;
  findings: ConvertedFinding[];
  articles: ConvertedArticle[];
  cache: LabelCache;
  problems: Problems;
  errors: string[];
  warnings: string[];
}
export interface ConvertInput {
  batches: Array<{
    file: string;
    findings: RawFinding[];
    articles: RawArticle[];
  }>;
  cache: LabelCache;
  provider: LabelProvider | null;
  offline: boolean;
}

type ResolvedLabel = {
  title: string;
  slug: string;
  source: ConvertedFinding["labelSource"];
};

async function resolveLabels(
  items: Array<{ key: string; claim: string }>,
  cache: LabelCache,
  provider: LabelProvider | null,
  offline: boolean,
  warnings: string[],
) {
  const labels = new Map<string, ResolvedLabel>();
  const pending: typeof items = [];
  for (const item of items) {
    const cached = cache.findings[item.key];
    if (cached) labels.set(item.key, { ...cached, source: "cache" });
    else pending.push(item);
  }
  pending.sort((a, b) => (a.key < b.key ? -1 : 1));
  if (pending.length && !offline && !provider)
    warnings.push(
      "INTERNAL_SERVICE_SECRET is not set; using offline labels (not cached)",
    );
  if (pending.length && !offline && provider)
    for (let i = 0; i < pending.length; i += LABEL_BATCH_SIZE) {
      const chunk = pending.slice(i, i + LABEL_BATCH_SIZE);
      try {
        const returned = new Map(
          (await provider(chunk)).map((l) => [l.key, l]),
        );
        for (const item of chunk) {
          const label = returned.get(item.key);
          const reason = label
            ? checkLabel(item.claim, label)
            : "missing from response";
          if (label && !reason)
            labels.set(item.key, {
              title: label.title.trim(),
              slug: slugify(label.slug) || slugify(label.title),
              source: "model",
            });
          else
            warnings.push(
              `label for ${item.key.slice(0, 8)} rejected (${reason}); using offline label (not cached)`,
            );
        }
      } catch (error) {
        warnings.push(
          `label request failed (${error instanceof Error ? error.message : String(error)}); using offline labels (not cached)`,
        );
      }
    }
  for (const item of pending)
    if (!labels.has(item.key))
      labels.set(item.key, {
        ...offlineLabel(item.claim, item.key),
        source: "offline",
      });
  return labels;
}

const tokens = (claim: string) =>
  new Set(claim.toLowerCase().match(/[a-z0-9]+/g) ?? []);
function similarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export async function convertCorpus(
  input: ConvertInput,
): Promise<ConvertResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const problems: Problems = {
    duplicateClaims: [],
    sharedSources: [],
    nearDuplicates: [],
    downgraded: [],
    fewOptions: [],
    multipleTitles: [],
    unmatchedReferences: [],
  };

  const references: ReferenceEntry[] = input.batches.flatMap((b) =>
    b.articles.flatMap((a) =>
      a.references.flatMap((r) =>
        r.title?.trim() && r.url?.trim()
          ? [{ title: r.title.trim(), url: r.url.trim() }]
          : [],
      ),
    ),
  );

  const findingsIn = input.batches.reduce((n, b) => n + b.findings.length, 0);
  const articlesIn = input.batches.reduce((n, b) => n + b.articles.length, 0);

  const unique = new Map<string, { file: string; raw: RawFinding }>();
  const duplicateFiles = new Map<string, string[]>();
  for (const { file, findings } of input.batches)
    for (const raw of findings) {
      const key = findingKey(raw.claim, raw.sourceUrl);
      if (unique.has(key)) duplicateFiles.get(key)!.push(file);
      else {
        unique.set(key, { file, raw });
        duplicateFiles.set(key, [file]);
      }
    }
  for (const [key, files] of duplicateFiles)
    if (files.length > 1)
      problems.duplicateClaims.push({
        claim: unique.get(key)!.raw.claim,
        files,
      });

  const labels = await resolveLabels(
    [...unique].map(([key, { raw }]) => ({ key, claim: raw.claim })),
    input.cache,
    input.provider,
    input.offline,
    warnings,
  );
  const slugs = assignSlugs(
    [...unique.keys()].map((key) => ({
      key,
      slug: labels.get(key)!.slug,
      cached: labels.get(key)!.source === "cache",
    })),
  );
  const cache: LabelCache = {
    findings: { ...input.cache.findings },
    articles: { ...input.cache.articles },
  };

  const findings: ConvertedFinding[] = [];
  for (const [key, { file, raw }] of unique) {
    const label = labels.get(key)!;
    const slug = slugs.get(key)!;
    if (label.source !== "offline")
      cache.findings[key] = { title: label.title, slug };
    const category = mapCategory(raw.field);
    if (!category) {
      errors.push(
        `${file}: finding "${slug}": field "${raw.field}" has no ResearchCategory member; add the enum value or fix the raw text`,
      );
      continue;
    }
    const match = matchReference(raw.sourceUrl, references);
    const doi = extractDoi(raw.sourceUrl);
    const validUrl = z.string().url().safeParse(raw.sourceUrl).success;
    const reasons: string[] = [];
    if (raw.verified !== true) reasons.push("verified flag is not true");
    if (!match.title) reasons.push("no article reference matches sourceUrl");
    if (!validUrl && !doi)
      reasons.push("sourceUrl is not a valid URL and has no DOI");
    const canSource = !!match.title && (validUrl || !!doi);
    const source = canSource
      ? {
          title: match.title!,
          ...(raw.authors.length ? { authors: raw.authors.join("; ") } : {}),
          ...(raw.publishedIn ? { venue: raw.publishedIn } : {}),
          ...(typeof raw.publicationYear === "number" &&
          raw.publicationYear >= 1
            ? { year: raw.publicationYear }
            : {}),
          ...(validUrl ? { url: raw.sourceUrl } : {}),
          ...(doi ? { doi } : {}),
        }
      : undefined;
    const appliesWhen = buildAppliesWhen(raw.appliesTo, raw.audience);
    const candidate = {
      slug,
      status: reasons.length ? "DRAFT" : "VERIFIED",
      category,
      title: label.title,
      statement: buildStatement(raw.claim, raw.options),
      ...(appliesWhen ? { appliesWhen } : {}),
      tags: buildTags(raw.field, raw.decision, raw.options),
      ...(source ? { source } : {}),
    };
    let output: FindingFile;
    try {
      output = parseFindingFile(candidate, `findings/${slug}.json`);
    } catch (error) {
      errors.push(
        `${file}: finding "${slug}" fails FindingFileSchema: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const flags: string[] = [];
    if (reasons.length) {
      problems.downgraded.push({ slug, reasons });
      flags.push("draft");
    }
    if (raw.options.length < 3) {
      problems.fewOptions.push({ slug, count: raw.options.length });
      flags.push(`${raw.options.length} options`);
    }
    if (match.titles.length > 1) {
      problems.multipleTitles.push({ slug, titles: match.titles });
      flags.push("multiple reference titles");
    }
    if ((duplicateFiles.get(key)?.length ?? 0) > 1)
      flags.push("duplicate claim");
    if (label.source === "offline") flags.push("offline label");
    if (category === "OTHER") flags.push("category OTHER");
    findings.push({
      key,
      file,
      slug,
      title: label.title,
      labelSource: label.source,
      output,
      sourceTitle: match.title,
      reasons,
      flags,
      sourceUrl: raw.sourceUrl,
      claim: raw.claim,
    });
  }
  findings.sort((a, b) => (a.slug < b.slug ? -1 : 1));

  const bySource = new Map<string, string[]>();
  for (const f of findings) {
    const url = normalizeUrl(f.sourceUrl);
    bySource.set(url, [...(bySource.get(url) ?? []), f.slug]);
  }
  for (const [url, list] of bySource)
    if (list.length > 1) {
      problems.sharedSources.push({ url, slugs: list });
      for (const f of findings)
        if (list.includes(f.slug)) f.flags.push("shared sourceUrl");
    }
  const sets = findings.map((f) => tokens(f.claim));
  for (let i = 0; i < findings.length; i++)
    for (let j = i + 1; j < findings.length; j++) {
      const score = similarity(sets[i]!, sets[j]!);
      if (score >= 0.9) {
        problems.nearDuplicates.push({
          a: findings[i]!.slug,
          b: findings[j]!.slug,
          similarity: Math.round(score * 100) / 100,
        });
        findings[i]!.flags.push("near-duplicate claim");
        findings[j]!.flags.push("near-duplicate claim");
      }
    }

  const uniqueArticles = new Map<string, { file: string; raw: RawArticle }>();
  for (const { file, articles } of input.batches)
    for (const raw of articles) {
      const key = sha256(raw.title);
      if (!uniqueArticles.has(key)) uniqueArticles.set(key, { file, raw });
    }
  const articleSlugs = assignSlugs(
    [...uniqueArticles].map(([key, { raw }]) => ({
      key,
      slug:
        input.cache.articles[key]?.slug ??
        (slugify(raw.title) || `article-${key.slice(0, 8)}`),
      cached: !!input.cache.articles[key],
    })),
  );
  const articles: ConvertedArticle[] = [];
  const findingUrls = new Set(
    [...unique.values()].map(({ raw }) => normalizeUrl(raw.sourceUrl)),
  );
  for (const [key, { file, raw }] of uniqueArticles) {
    const slug = articleSlugs.get(key)!;
    const category = mapCategory(raw.category);
    if (!category) {
      errors.push(
        `${file}: article "${raw.title}": category "${raw.category}" has no ResearchCategory member; add the enum value or fix the raw text`,
      );
      continue;
    }
    const parsed = ArticleFileSchema.safeParse({
      slug,
      title: raw.title,
      kind: "ARTICLE",
      category,
      summary: raw.summary,
      sections: raw.sections,
      body: raw.body,
      tags: raw.tags,
      references: raw.references,
      isPublished: true,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      errors.push(
        `${file}: article "${raw.title}" fails ArticleFileSchema: ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`,
      );
      continue;
    }
    cache.articles[key] = { slug };
    articles.push({ key, file, slug, output: parsed.data });
    for (const ref of raw.references)
      if (!ref.url?.trim() || !findingUrls.has(normalizeUrl(ref.url.trim())))
        problems.unmatchedReferences.push({
          article: slug,
          reference:
            ref.title?.trim() || ref.url?.trim() || "(untitled reference)",
        });
  }
  articles.sort((a, b) => (a.slug < b.slug ? -1 : 1));

  return {
    findingsIn,
    articlesIn,
    findings,
    articles,
    cache,
    problems,
    errors,
    warnings,
  };
}
