import type { ConvertResult } from "./corpusConvert.js";

export interface FileChange {
  slug: string;
  action: "create" | "unchanged" | "update" | "skip";
  diff?: string;
}
export interface UrlCheck {
  url: string;
  problem: string | null;
}
export interface ReportContext {
  filesRead: number;
  parseErrors: string[];
  changes: FileChange[];
  orphans: string[];
  urlChecks?: UrlCheck[];
}

const cell = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|");
const section = (title: string, lines: string[]) =>
  `## ${title}\n\n${lines.length ? lines.join("\n") : "None."}\n`;

export function reportCounts(
  result: ConvertResult,
  filesRead: number,
  errors: number,
) {
  return {
    filesRead,
    findingsIn: result.findingsIn,
    findingsWritten: result.findings.length,
    verified: result.findings.filter((f) => f.output.status === "VERIFIED")
      .length,
    draft: result.findings.filter((f) => f.output.status === "DRAFT").length,
    articles: result.articles.length,
    errors,
  };
}

export function lineDiff(before: string, after: string): string {
  const a = before.split("\n");
  const b = after.split("\n");
  const table = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      table[i]![j] =
        a[i] === b[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) out.push(`- ${a[i++]}`);
    else out.push(`+ ${b[j++]}`);
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return out.join("\n");
}

export function renderSummary(
  result: ConvertResult,
  context: ReportContext,
): string {
  const counts = reportCounts(
    result,
    context.filesRead,
    result.errors.length + context.parseErrors.length,
  );
  const rows = result.findings.map(
    (f) =>
      `| ${cell(f.slug)} | ${cell(f.title)} | ${f.output.status} | ${f.output.category} | ${cell(f.sourceTitle)} | ${cell(f.flags.join(", "))} |`,
  );
  return [
    "# Corpus conversion summary",
    "",
    "| Metric | Count |",
    "| --- | --- |",
    `| Files read | ${counts.filesRead} |`,
    `| Findings in | ${counts.findingsIn} |`,
    `| Findings written (unique) | ${counts.findingsWritten} |`,
    `| VERIFIED | ${counts.verified} |`,
    `| DRAFT | ${counts.draft} |`,
    `| Articles | ${counts.articles} |`,
    `| Errors | ${counts.errors} |`,
    "",
    "## Findings",
    "",
    "| Slug | Title | Status | Category | Source title | Flags |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Articles",
    "",
    "| Slug | Title | Category |",
    "| --- | --- | --- |",
    ...result.articles.map(
      (a) =>
        `| ${cell(a.slug)} | ${cell(a.output.title)} | ${a.output.category} |`,
    ),
    "",
  ].join("\n");
}

export function renderProblems(
  result: ConvertResult,
  context: ReportContext,
): string {
  const p = result.problems;
  const urlWarnings = (context.urlChecks ?? []).filter((c) => c.problem);
  return [
    "# Corpus conversion problems",
    "",
    section("Errors (fail the run)", [
      ...context.parseErrors.map((e) => `- ${e}`),
      ...result.errors.map((e) => `- ${e}`),
    ]),
    section(
      "Downgraded to DRAFT",
      p.downgraded.map((d) => `- \`${d.slug}\`: ${d.reasons.join("; ")}`),
    ),
    section(
      "Fewer than 3 options",
      p.fewOptions.map((d) => `- \`${d.slug}\`: ${d.count}`),
    ),
    section(
      "sourceUrl matches more than one reference title",
      p.multipleTitles.map(
        (d) =>
          `- \`${d.slug}\`: ${d.titles.map((t) => `"${t}"`).join(" / ")} (first used)`,
      ),
    ),
    section(
      "Duplicate claims (same claim and sourceUrl)",
      p.duplicateClaims.map(
        (d) =>
          `- "${d.claim.slice(0, 100)}" in ${d.files.join(", ")} (first kept)`,
      ),
    ),
    section(
      "Findings sharing a sourceUrl",
      p.sharedSources.map(
        (d) => `- ${d.url}: ${d.slugs.map((s) => `\`${s}\``).join(", ")}`,
      ),
    ),
    section(
      "Near-identical claims",
      p.nearDuplicates.map(
        (d) => `- \`${d.a}\` ~ \`${d.b}\` (${d.similarity})`,
      ),
    ),
    section(
      "Article references matching no finding",
      p.unmatchedReferences.map((d) => `- \`${d.article}\`: ${d.reference}`),
    ),
    section(
      "Label warnings",
      result.warnings.map((w) => `- ${w}`),
    ),
    section(
      "Existing files changed by the converter",
      context.changes
        .filter((c) => c.action === "update")
        .map((c) => `- \`${c.slug}.json\`\n\n\`\`\`diff\n${c.diff}\n\`\`\``),
    ),
    section(
      "Existing files left untouched (not owned by this finding)",
      context.changes
        .filter((c) => c.action === "skip")
        .map(
          (c) =>
            `- \`${c.slug}.json\`: differs and belongs to another claim; delete it or change the slug in corpus/_labels.json`,
        ),
    ),
    section(
      "Files in corpus/findings not generated by this run",
      context.orphans.map((o) => `- ${o}`),
    ),
    ...(context.urlChecks
      ? [
          section(
            "URL check warnings",
            urlWarnings.map((c) => `- ${c.url}: ${c.problem}`),
          ),
        ]
      : []),
  ].join("\n");
}

export async function checkUrls(
  urls: string[],
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    concurrency?: number;
  } = {},
): Promise<UrlCheck[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const queue = [...new Set(urls)].sort();
  const results: UrlCheck[] = [];
  const probe = async (url: string): Promise<string | null> => {
    let last: string | null = null;
    for (const method of ["HEAD", "GET"]) {
      try {
        const response = await fetchImpl(url, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        void response.body?.cancel();
        if (response.ok) return null;
        last = `HTTP ${response.status}`;
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
      }
    }
    return last;
  };
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift())
      results.push({ url, problem: await probe(url) });
  };
  await Promise.all(
    Array.from({ length: options.concurrency ?? 3 }, () => worker()),
  );
  return results.sort((a, b) => (a.url < b.url ? -1 : 1));
}
