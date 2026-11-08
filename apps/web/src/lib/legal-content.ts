import { readFileSync } from "node:fs";
import path from "node:path";
import { LEGAL, type LegalSlug } from "./legal";

type TemplateValues = Readonly<Record<string, string | null>>;

export type LegalHeading = { id: string; text: string };

export type LegalDocument = {
  title: string;
  slug: string;
  body: string;
  headings: LegalHeading[];
};

const CONDITIONAL_BLOCK = /<!--if:(\w+)-->\n?([\s\S]*?)<!--\/if-->\n?/g;
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export function renderLegalTemplate(
  source: string,
  values: TemplateValues = LEGAL,
): string {
  const withBlocks = source.replace(
    CONDITIONAL_BLOCK,
    (_match, key: string, body: string) => {
      if (!(key in values)) {
        throw new Error(`Unknown legal condition "${key}"`);
      }
      return values[key] ? body : "";
    },
  );

  const rendered = withBlocks.replace(PLACEHOLDER, (match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) {
      throw new Error(`Unresolved legal placeholder ${match}`);
    }
    return value;
  });

  if (rendered.includes("{{") || rendered.includes("<!--")) {
    throw new Error("Legal content still contains template markup");
  }
  return rendered;
}

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseLegalDocument(
  raw: string,
  values: TemplateValues = LEGAL,
): LegalDocument {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error("Legal document is missing frontmatter");

  const [, frontmatter = "", source = ""] = match;
  const fields = new Map(
    frontmatter.split("\n").map((line) => {
      const separator = line.indexOf(":");
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    }),
  );
  const title = fields.get("title");
  const slug = fields.get("slug");
  if (!title || !slug) {
    throw new Error("Legal document frontmatter needs title and slug");
  }

  const body = renderLegalTemplate(source, values).trim();
  const headings = [...body.matchAll(/^## (.+)$/gm)].map(([, text = ""]) => ({
    id: headingId(text),
    text,
  }));
  const ids = new Set(headings.map((h) => h.id));
  if (ids.size !== headings.length) {
    throw new Error(`Legal document "${slug}" has duplicate headings`);
  }

  return { title, slug, body, headings };
}

export function loadLegalDocument(slug: LegalSlug): LegalDocument {
  const file = path.join(process.cwd(), "content", "legal", `${slug}.md`);
  const document = parseLegalDocument(readFileSync(file, "utf8"));
  if (document.slug !== slug) {
    throw new Error(`Legal document ${file} declares slug "${document.slug}"`);
  }
  return document;
}
