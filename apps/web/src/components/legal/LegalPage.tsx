import { Footer } from "@/components/home/sections/Footer";
import { Navbar } from "@/components/home/Navbar";
import { landingFont } from "@/components/home/fonts";
import { LegalMarkdown, legalLinkClass } from "@/components/legal/LegalMarkdown";
import {
  LEGAL,
  LEGAL_PAGES,
  legalStructuredData,
  type LegalSlug,
} from "@/lib/legal";
import { loadLegalDocument } from "@/lib/legal-content";

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const page = LEGAL_PAGES[slug];
  const document = loadLegalDocument(slug);

  return (
    <div
      className={`${landingFont.className} min-h-screen overflow-x-clip bg-white`}
    >
      <Navbar serifClassName={landingFont.className} />
      <main className="px-6 pt-28 pb-20 sm:pt-32">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(legalStructuredData(page)).replace(
              /</g,
              "\\u003c",
            ),
          }}
        />
        <article className="mx-auto max-w-[65ch] text-[15px] leading-relaxed text-slate-700">
          <header>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {document.title}
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Last updated:{" "}
              <time dateTime={LEGAL.lastUpdatedISO}>{LEGAL.lastUpdated}</time>
            </p>
          </header>

          {document.headings.length > 1 && (
            <nav
              aria-labelledby="legal-toc"
              className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-5"
            >
              <p
                id="legal-toc"
                className="text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                On this page
              </p>
              <ol className="mt-3 space-y-1.5 text-sm">
                {document.headings.map((heading) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`} className={legalLinkClass}>
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="mt-8">
            <LegalMarkdown body={document.body} />
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
