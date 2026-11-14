import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  convertCorpus,
  parseRawBatch,
  type ConvertResult,
  type ConvertedFinding,
  type RawArticle,
  type RawFinding,
} from "./corpusConvert.js";
import {
  ArticleFileSchema,
  importArticles,
  type ArticleFile,
  type ArticleStore,
} from "./corpusArticles.js";
import {
  checkUrls,
  lineDiff,
  reportCounts,
  renderProblems,
  renderSummary,
  type FileChange,
  type UrlCheck,
} from "./corpusReport.js";
import {
  LabelCacheSchema,
  type LabelCache,
  type LabelProvider,
} from "./labels.js";

export interface ConvertOptions {
  corpusDir: string;
  dryRun: boolean;
  offline: boolean;
  checkUrls: boolean;
  provider: LabelProvider | null;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const sorted = <T>(record: Record<string, T>) =>
  Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)),
  );

async function jsonFiles(directory: string) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((f) => f.isFile() && f.name.endsWith(".json"))
      .map((f) => f.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readIfExists(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadCache(path: string): Promise<LabelCache> {
  const existing = await readIfExists(path);
  if (existing === null) return LabelCacheSchema.parse({});
  try {
    return LabelCacheSchema.parse(JSON.parse(existing));
  } catch (error) {
    throw new Error(
      `${path} is invalid; fix it before converting: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// A differing file is only replaced when it was produced from the same claim and source.
function ownsFile(existing: string, finding: ConvertedFinding) {
  try {
    const parsed = JSON.parse(existing) as {
      statement?: unknown;
      source?: { url?: unknown };
    };
    if (typeof parsed.statement !== "string") return false;
    const claim = parsed.statement.split("\n\nOptions:\n")[0];
    return (
      claim === finding.claim &&
      (parsed.source?.url ?? finding.sourceUrl) === finding.sourceUrl
    );
  } catch {
    return false;
  }
}

async function planFindingWrites(
  directory: string,
  findings: ConvertedFinding[],
) {
  const changes: FileChange[] = [];
  const contents = new Map<string, string>();
  for (const finding of findings) {
    const content = json(finding.output);
    const existing = await readIfExists(
      join(directory, `${finding.slug}.json`),
    );
    if (existing === null)
      changes.push({ slug: finding.slug, action: "create" });
    else if (existing === content)
      changes.push({ slug: finding.slug, action: "unchanged" });
    else if (ownsFile(existing, finding))
      changes.push({
        slug: finding.slug,
        action: "update",
        diff: lineDiff(existing.trimEnd(), content.trimEnd()),
      });
    else changes.push({ slug: finding.slug, action: "skip" });
    contents.set(finding.slug, content);
  }
  return { changes, contents };
}

export async function runConvert(options: ConvertOptions) {
  const log = options.log ?? console.log;
  const rawDir = join(options.corpusDir, "raw");
  const findingsDir = join(options.corpusDir, "findings");
  const articlesDir = join(options.corpusDir, "articles");
  const files = await jsonFiles(rawDir);
  if (!files?.length) throw new Error(`No batch files found in ${rawDir}`);
  const cache = await loadCache(join(options.corpusDir, "_labels.json"));

  const inputErrors: string[] = [];
  const batches: Array<{
    file: string;
    findings: RawFinding[];
    articles: RawArticle[];
  }> = [];
  for (const file of files) {
    const parsed = parseRawBatch(await readFile(join(rawDir, file), "utf8"));
    if (!parsed.ok) {
      inputErrors.push(`${file}: ${parsed.error}`);
      continue;
    }
    inputErrors.push(...parsed.errors.map((e) => `${file}: ${e}`));
    batches.push({
      file,
      findings: parsed.findings,
      articles: parsed.articles,
    });
  }
  for (const error of inputErrors) console.error(error);

  const result: ConvertResult = await convertCorpus({
    batches,
    cache,
    provider: options.provider,
    offline: options.offline,
  });

  const { changes, contents } = await planFindingWrites(
    findingsDir,
    result.findings,
  );
  const produced = new Set(result.findings.map((f) => `${f.slug}.json`));
  const orphans = ((await jsonFiles(findingsDir)) ?? []).filter(
    (f) => !produced.has(f),
  );
  let urlChecks: UrlCheck[] | undefined;
  if (options.checkUrls)
    urlChecks = await checkUrls(
      result.findings.flatMap((f) => (f.sourceUrl ? [f.sourceUrl] : [])),
      { fetchImpl: options.fetchImpl },
    );
  const context = {
    filesRead: files.length,
    parseErrors: inputErrors,
    changes,
    orphans,
    urlChecks,
  };
  const summary = renderSummary(result, context);
  const problems = renderProblems(result, context);

  if (!options.dryRun) {
    await mkdir(findingsDir, { recursive: true });
    for (const change of changes)
      if (change.action === "create" || change.action === "update")
        await writeFile(
          join(findingsDir, `${change.slug}.json`),
          contents.get(change.slug)!,
        );
    await mkdir(articlesDir, { recursive: true });
    for (const article of result.articles) {
      const path = join(articlesDir, `${article.slug}.json`);
      const content = json(article.output);
      if ((await readIfExists(path)) !== content)
        await writeFile(path, content);
    }
    await writeFile(
      join(options.corpusDir, "_labels.json"),
      json({
        findings: sorted(result.cache.findings),
        articles: sorted(result.cache.articles),
      }),
    );
  }
  // The review reports are written on dry runs too: they are what a dry run is for.
  await mkdir(join(options.corpusDir, "_review"), { recursive: true });
  await writeFile(join(options.corpusDir, "_review", "summary.md"), summary);
  await writeFile(join(options.corpusDir, "_review", "problems.md"), problems);

  const errorCount = inputErrors.length + result.errors.length;
  const counts = reportCounts(result, files.length, errorCount);
  const tally = (action: FileChange["action"]) =>
    changes.filter((c) => c.action === action).length;
  log(
    `${options.dryRun ? "[dry run] " : ""}files read ${counts.filesRead}, findings in ${counts.findingsIn}, written ${counts.findingsWritten} (${tally("create")} new, ${tally("update")} changed, ${tally("unchanged")} unchanged, ${tally("skip")} skipped), VERIFIED ${counts.verified}, DRAFT ${counts.draft}, articles ${counts.articles}, errors ${counts.errors}`,
  );
  for (const error of result.errors) console.error(error);
  for (const warning of result.warnings) console.warn(`warning: ${warning}`);
  if (options.dryRun) log(`\n${problems}`);
  log(`Reports: ${join(options.corpusDir, "_review")}`);
  return { exitCode: errorCount ? 1 : 0, result, changes, summary, problems };
}

export async function runImportArticles(options: {
  corpusDir: string;
  dryRun: boolean;
  store: ArticleStore;
  log?: (line: string) => void;
}) {
  const log = options.log ?? console.log;
  const directory = join(options.corpusDir, "articles");
  const names = await jsonFiles(directory);
  if (!names?.length) throw new Error(`No article files found in ${directory}`);
  const articles: ArticleFile[] = [];
  const errors: string[] = [];
  for (const name of names) {
    try {
      const article = ArticleFileSchema.parse(
        JSON.parse(await readFile(join(directory, name), "utf8")),
      );
      if (name !== `${article.slug}.json`)
        throw new Error("slug must equal the JSON filename");
      articles.push(article);
    } catch (error) {
      errors.push(
        `${name}: INVALID ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (errors.length) {
    for (const error of errors) console.error(error);
    return { exitCode: 1, counts: null };
  }
  const counts = await importArticles(options.store, articles, {
    dryRun: options.dryRun,
  });
  log(
    `${options.dryRun ? "[dry run] " : ""}created ${counts.created}, updated ${counts.updated}, unchanged ${counts.unchanged}`,
  );
  return { exitCode: 0, counts };
}
