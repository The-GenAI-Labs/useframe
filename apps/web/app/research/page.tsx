import type { Metadata } from "next";
import Link from "next/link";
import { ResearchCategoryEnum, type ArticleListItem, type ResearchCategory } from "@repo/schemas";
import { Footer } from "@/components/home/sections/Footer";
import { Navbar } from "@/components/home/Navbar";
import { landingFont } from "@/components/home/fonts";
import { pageMetadata } from "@/lib/metadata";
import { fetchArticles } from "@/lib/researchArticles";
import { categoryLabel } from "@/lib/researchCategories";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata(
  "Design Research",
  "Plain-language articles on the published research behind good website design: colour, typography, layout, conversion and accessibility.",
  { path: "/research", indexable: true, fullTitle: "Design Research Articles | useframe" },
);

const chipClass =
  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default async function ResearchArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category: rawCategory } = await searchParams;
  const parsed = ResearchCategoryEnum.safeParse(rawCategory);
  const selected: ResearchCategory | null = parsed.success ? parsed.data : null;

  let articles: ArticleListItem[] | null = null;
  try {
    articles = await fetchArticles();
  } catch {
    articles = null;
  }

  const categories = [...new Set((articles ?? []).map((a) => a.category))];
  const groups = categories
    .filter((c) => !selected || c === selected)
    .map((category) => ({ category, items: (articles ?? []).filter((a) => a.category === category) }));

  return (
    <div className={`${landingFont.className} min-h-screen overflow-x-clip bg-white`}>
      <Navbar serifClassName={landingFont.className} />
      <main className="px-6 pt-28 pb-20 sm:pt-32">
        <div className="mx-auto max-w-5xl">
          <header className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Design research</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Short, plain-language articles on the published research behind good website design.
            </p>
          </header>

          {articles === null ? (
            <p role="alert" className="mt-12 text-sm text-slate-600">
              We couldn&apos;t load the articles right now. Please try again in a moment.
            </p>
          ) : articles.length === 0 ? (
            <p className="mt-12 text-sm text-slate-600">No articles have been published yet.</p>
          ) : (
            <>
              <nav aria-label="Filter articles by category" className="mt-8 flex flex-wrap gap-2">
                <Link
                  href="/research"
                  aria-current={selected === null ? "page" : undefined}
                  className={`${chipClass} ${selected === null ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}
                >
                  All
                </Link>
                {categories.map((category) => (
                  <Link
                    key={category}
                    href={`/research?category=${category}`}
                    aria-current={selected === category ? "page" : undefined}
                    className={`${chipClass} ${selected === category ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700 hover:border-slate-400"}`}
                  >
                    {categoryLabel(category)}
                  </Link>
                ))}
              </nav>

              {groups.length === 0 && (
                <p className="mt-12 text-sm text-slate-600">No articles in this category yet.</p>
              )}

              {groups.map((group) => (
                <section key={group.category} aria-labelledby={`cat-${group.category}`} className="mt-12">
                  <h2 id={`cat-${group.category}`} className="text-xl font-semibold tracking-tight text-slate-900">
                    {categoryLabel(group.category)}
                  </h2>
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((article) => (
                      <li key={article.slug}>
                        <Link
                          href={`/research/${article.slug}`}
                          className="flex h-full flex-col rounded-2xl border border-slate-200 p-5 transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          <span className="text-base font-semibold text-slate-900">{article.title}</span>
                          <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{article.summary}</span>
                          {article.tags.length > 0 && (
                            <span className="mt-auto pt-4 text-xs text-slate-500">{article.tags.slice(0, 4).join(" · ")}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
