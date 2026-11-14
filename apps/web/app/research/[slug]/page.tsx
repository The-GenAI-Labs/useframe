import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Footer } from "@/components/home/sections/Footer";
import { Navbar } from "@/components/home/Navbar";
import { landingFont } from "@/components/home/fonts";
import { LegalMarkdown, legalLinkClass } from "@/components/legal/LegalMarkdown";
import { pageMetadata } from "@/lib/metadata";
import {
  articleDescription,
  articleStructuredData,
  fetchArticle,
  fetchFindingSlug,
} from "@/lib/researchArticles";
import { categoryLabel, paperLink } from "@/lib/researchCategories";

export const dynamic = "force-dynamic";

const loadArticle = cache(fetchArticle);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) return pageMetadata("Research", "Design research from useframe.");
  const metadata = pageMetadata(article.title, articleDescription(article.summary), {
    path: `/research/${article.slug}`,
    indexable: true,
    fullTitle: `${article.title} | useframe research`,
  });
  return {
    ...metadata,
    keywords: article.tags,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      ...(article.publishedAt ? { publishedTime: article.publishedAt } : {}),
      modifiedTime: article.updatedAt,
      tags: article.tags,
    },
  };
}

export default async function ResearchArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await loadArticle(slug);
  if (!article) {
    const findingSlug = await fetchFindingSlug(slug).catch(() => null);
    if (findingSlug) redirect(`/research/library/${findingSlug}`);
    notFound();
  }

  const published = article.publishedAt ? new Date(article.publishedAt) : null;

  return (
    <div className={`${landingFont.className} min-h-screen overflow-x-clip bg-white`}>
      <Navbar serifClassName={landingFont.className} />
      <main className="px-6 pt-28 pb-20 sm:pt-32">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(articleStructuredData(article)).replace(/</g, "\\u003c"),
          }}
        />
        <article className="mx-auto max-w-[65ch] text-[15px] leading-relaxed text-slate-700">
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link href="/research" className={legalLinkClass}>
              Research
            </Link>
            <span aria-hidden="true" className="px-2 text-slate-400">/</span>
            <Link href={`/research?category=${article.category}`} className={legalLinkClass}>
              {categoryLabel(article.category)}
            </Link>
          </nav>

          <header className="mt-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{article.title}</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{article.summary}</p>
            {published && (
              <p className="mt-3 text-sm text-slate-500">
                Published{" "}
                <time dateTime={article.publishedAt!}>
                  {published.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                </time>
              </p>
            )}
          </header>

          <div className="mt-8">
            {article.sections.length > 0 ? (
              article.sections.map((section, index) => (
                <section key={`${section.heading}-${index}`}>
                  {section.heading && (
                    <h2 className="mt-12 text-xl font-semibold tracking-tight text-slate-900">{section.heading}</h2>
                  )}
                  <LegalMarkdown body={section.body} />
                </section>
              ))
            ) : (
              <LegalMarkdown body={article.body} />
            )}
          </div>

          {article.references.length > 0 && (
            <section aria-labelledby="references" className="mt-14 border-t border-slate-200 pt-8">
              <h2 id="references" className="text-xl font-semibold tracking-tight text-slate-900">
                References
              </h2>
              <ol className="mt-4 list-decimal space-y-3 pl-6 text-sm">
                {article.references.map((ref, index) => {
                  const href = paperLink(ref);
                  const meta = [ref.authors, ref.venue, ref.year].filter(Boolean).join(" · ");
                  return (
                    <li key={index}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className={legalLinkClass}>
                          {ref.title ?? href}
                        </a>
                      ) : (
                        <span className="font-medium text-slate-900">{ref.title}</span>
                      )}
                      {meta && <span className="block text-slate-500">{meta}</span>}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {article.tags.length > 0 && (
            <ul aria-label="Tags" className="mt-10 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <li key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </article>
      </main>
      <Footer />
    </div>
  );
}
