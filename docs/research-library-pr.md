# Research Library and public research articles

Public, indexable research articles at `/research` and `/research/[slug]`, and a signed-in, noindex Research Library of findings at `/research/library` and `/research/library/[slug]`. Full finding text is gated on the server.

## Entitlement rule

`hasFullResearchAccess(userId)` (`apps/server/src/lib/researchAccess.ts`) is the only place the rule lives: the user has at least one `Payment` with status `SUCCESS` whose plan has `unlocksFullResearch = true`. `REFUNDED`, `PARTIALLY_REFUNDED`, `FLAGGED`, `PENDING` and `FAILED` never count. Access does not expire.

- `Plan.unlocksFullResearch` (additive migration `20261113000000_plan_unlocks_full_research`, default `false`); the plans seed sets it on `agency` only. No price or credit changes.
- Own-project exception: a finding saved as a `ResearchReportCitation` in one of the user's own, non-deleted projects can be opened in full. The check uses the stored citations, never client input.
- Locked list items return only `title`, `category`, source `year` and `venue` (`locked: true`); locked search matches only title and tags (`ts_filter` on the weight-A part of `searchVector`), so hidden text cannot be probed.
- DRAFT and RETIRED findings never appear in the list or detail.

## What changed

- API (`apps/server`): `modules/researchLibrary` (`GET /api/research/library/access`, `/categories`, `/findings`, `/findings/:slug`; authenticated, zod-validated, `Cache-Control: private, no-store`, 60/min list and meta, 120/min detail) and `modules/researchArticles` (public `GET /api/research/articles`, `/:slug`; `public, max-age=300`).
- Closed two leaks of full finding text: the public `GET /api/findings/:id` now returns only `{ id, slug, title }` for VERIFIED findings (used to redirect old `/research/<id>` links), and the project finding lookup used by the brief editor now checks project ownership and the entitlement rule.
- Shared contracts: `packages/schemas/src/researchLibrary.schema.ts` (query/params schemas, response shapes, `parseFindingStatement`).
- Web: article list and detail pages (canonical, OpenGraph article, Article JSON-LD with citations, sitemap entries), library list (search, category filters with counts, Load more) and detail (source card, related findings, upgrade banner), `FindingCard`, `FindingStatement`, `UpgradeBanner`. The sidebar "Research" item is now "Research Library"; the old placeholder page and `ResearchView` are removed. The brief editor shows "This finding is part of the full research library" with a link to plans when a finding is locked.
- Converter (`packages/rag`): a null or empty `sourceUrl` is a DRAFT ("sourceUrl is missing") instead of an error; when one `sourceUrl` matches several reference titles, the finding's `publishedIn` is the source title (first reference title only without `publishedIn`) and the choice is listed in `problems.md`; dry runs now write the `corpus/_review/` reports (gitignored).

## Reused

`authenticate`, `minuteRateLimit`, `AppError` and the error middleware, the routes/controller/service/schema module pattern, the shared Prisma client, `searchVector` from ingestion, `LegalMarkdown` for article sections, `pageMetadata`, `Navbar`/`Footer`, `PageFadeIn`, the shared axios client and its error shape (`status`, `code`), TanStack Query.

## Assumptions

- No finding card or article page existed, so `FindingCard` and the article pages are new.
- Locked list items also omit `slug` and `tags`; the excerpt is the first 200 characters of the claim with an ellipsis.
- Library search is ordered by slug (stable cursor), not by relevance.
- `/access` also returns `upgradePlanName` for the banner; the upgrade plan is the active unlocking plan with the highest price.
- A locked user's brief editor shows the locked message for a finding that is not among the project's saved citations.
- The public article API has no rate limit because server-side rendering shares one IP; responses are cacheable.

## Commands to run

```sh
pnpm --dir packages/db exec prisma migrate deploy   # intended database only
pnpm --filter @useframe/db seed:plans
pnpm --filter @useframe/db build && pnpm --filter @repo/schemas build
pnpm corpus:convert --dry-run   # read corpus/_review/, then run without --dry-run
pnpm corpus:validate && pnpm corpus:ingest && pnpm corpus:import-articles
```
