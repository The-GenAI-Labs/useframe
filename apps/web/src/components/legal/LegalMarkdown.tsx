import { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import { headingId } from "@/lib/legal-content";

export const legalLinkClass =
  "rounded-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return "";
}

function transformUrl(url: string): string {
  return /^tel:\+\d+$/.test(url) ? url : defaultUrlTransform(url);
}

const components: Components = {
  h2: ({ children }) => (
    <h2
      id={headingId(textOf(children))}
      className="mt-12 scroll-mt-28 text-xl font-semibold tracking-tight text-slate-900"
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      id={headingId(textOf(children))}
      className="mt-8 scroll-mt-28 text-base font-semibold text-slate-900"
    >
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mt-4">{children}</p>,
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-6 marker:text-slate-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-6">{children}</ol>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href} className={legalLinkClass}>
        {children}
      </Link>
    ) : (
      <a href={href} className={legalLinkClass}>
        {children}
      </a>
    ),
};

export function LegalMarkdown({ body }: { body: string }) {
  return (
    <Markdown components={components} skipHtml urlTransform={transformUrl}>
      {body}
    </Markdown>
  );
}
