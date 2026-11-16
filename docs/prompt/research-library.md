# Build Prompt — Research Library (articles for everyone, structured findings for the top plan)

Paste this whole document to Claude Code as one instruction. Do not ask me questions. If something is
ambiguous, choose the simplest option that fits the repo and list it in the PR description.

## 0. What this builds

After research data is ingested (`corpus:convert`, `corpus:ingest`, `corpus:import-articles` already exist),
users need to see it:

1. **Articles** (rows in `research_articles`): public, SEO-friendly reading pages grouped by category.
2. **Research Library** (rows in `research_findings` + `source_documents`): a structured view of each
   finding with its source. Full access only for users who bought the top plan. Everyone else sees only
   (a) findings cited in **their own** projects, and (b) a locked preview with an upgrade prompt.

Findings stay a plain Postgres feature here. **No vector search in the UI**; use the existing Postgres
full-text column (`searchVector`) for the search box.

## 1. Inspect first (do not change code yet), then adapt

- Existing research pages and routes in the web app (the Research page, the project Research tab, any
  article list or detail page that already reads `ResearchArticle`). Reuse and extend them. Do not build a
  second article system.
- `getProjectResearch` / `CitedFindingView` in `packages/rag` and how the project Research tab renders
  them. Reuse its finding card component for the library.
- The plans table and payment rows (planId, snapshot columns, status values, refund/flag states).
- How api-service registers routes, checks login and project ownership, and rate limits.
- How the other public pages do SEO (metadata helper, canonical, Open Graph, JSON-LD, sitemap). Reuse it.
- How a finding's `statement` looks. The converter writes it as: the claim, a blank line, `Options:`, then
  one line per option like `- {label}: {value} (fits: …)`. The library must render that as a claim paragraph
  plus a clean options list. If a statement has no `Options:` block, show it as plain text.

## 2. Access rule (decided; make it config-driven, not hardcoded)

- Add to `Plan`: `unlocksFullResearch Boolean @default(false)` (additive migration). Seed: the top plan
  (the highest `priceMinor`, currently `agency` at 19900) is `true`; the others `false`. Update the plans
  seed file only; do not change any prices or credits.
- `hasFullResearchAccess(userId)` = the user has at least one payment that is completed (not refunded,
  not flagged) whose plan has `unlocksFullResearch = true`. One-time credit packs never expire, so the
  access does not expire. Put this function in one place and use it everywhere.
- **Every check happens on the server (api-service).** A locked user must never receive a finding's
  `statement`, options, excerpt or relations in any API response, even by calling the API directly.
- Exception: a user can always open the detail of a finding that is cited in one of **their own** projects
  (ownership check through the saved citations).

## 3. API (api-service; login required; rate limited; zod on input and output)

| Route | Behaviour |
|---|---|
| `GET /api/research/library/categories` | Categories with counts of `VERIFIED` findings. Allowed for any logged-in user. |
| `GET /api/research/library/findings?category=&q=&tag=&cursor=&limit=` | Cursor-paginated list of `VERIFIED` findings only (never DRAFT or RETIRED). Entitled: full list items (slug, title, category, tags, appliesWhen, short excerpt = first 200 chars of the claim, source summary). Not entitled: same items but **title, category, source year and venue only**, with `locked: true`. `q` uses `plainto_tsquery` on `searchVector` and works for both, matching only on title and tags for locked users so the hidden text cannot be probed. |
| `GET /api/research/library/findings/:slug` | Entitled, or the finding is cited in the user's own project: full detail (title, category, tags, appliesWhen, full `statement`, source with url/doi, related findings via `FindingRelation` with their titles and slugs, `reuseCount`). Otherwise 403 with code `RESEARCH_LOCKED`. Unknown slug or non-VERIFIED → 404. |
| `GET /api/research/library/access` | `{ hasFullAccess: boolean, upgradePlanSlug: string \| null }` for the UI. |

Limits: 60 requests per minute per user on the list, 120 on detail. Responses are `Cache-Control: private,
no-store`. Page size default 20, max 50.

## 4. Web

**Articles (public, indexable):**
- `/research` lists published articles grouped by category with a category filter; `/research/[slug]`
  (or the existing route) renders `title`, `summary`, `sections` or `body` (reuse the existing markdown
  renderer), the `references` list with links, and `tags`.
- If these pages already exist, make sure they show the newly imported rows with correct categories and
  fix only what is missing. SEO per page: title, description (the summary, ≤ 160 chars), canonical, Open
  Graph, `Article` JSON-LD with `citation` entries from `references`, sitemap entries.

**Research Library (logged in, `noindex`):**
- `/research/library`: category tabs with counts, a search box, a result list (cards), pagination
  ("Load more"). Loading skeletons, empty state, error state with retry.
- Entitled: normal cards linking to `/research/library/[slug]`.
- Not entitled: the same cards, locked (lock icon, title, category, source year and venue; no text), a
  clear banner "Unlock the full research library with the {top plan name} plan" linking to pricing, and a
  line "Findings cited in your own projects are always open, in your project's Research tab."
- `/research/library/[slug]` detail page, structured: title, category chip, tags; the claim as a heading
  paragraph; an **Options** list (label, value, "good for" tags); **Applies when**; a **Source** card
  (title, authors, year, venue, "Open the paper" link using doi or url, opens in a new tab with
  `rel="noopener noreferrer"`); **Related findings**; "Cited in N projects" when `reuseCount` > 0.
  Locked users who land here without ownership see the locked state with the upgrade prompt.
- A fixed note on every finding: "This is a summary of published research by UseFrame. Please read the
  original paper for full details."
- Add a "Research Library" link in the main app navigation for logged-in users.
- Accessible (keyboard, focus, labels, aria-live for results), mobile friendly, same design system as the
  rest of the app.

## 5. Tests (no real network)

- Server gating: a locked user calling the list gets no `statement`, options or excerpt anywhere; the
  detail returns 403 `RESEARCH_LOCKED`; `q` cannot match hidden statement text for locked users.
- An entitled user gets full data. A refunded or flagged payment does not give access.
- A locked user can open a finding cited in their own project, and cannot open one cited only in
  someone else's project.
- DRAFT and RETIRED findings never appear in the list or detail.
- Pagination cursor, category filter, tag filter, full-text search.
- The `Options:` block parsing renders a list, and plain statements still render.
- Article pages return 200 without login and include the JSON-LD; library pages are `noindex`.
- Lint, type check and build pass.

## 6. Do not build

Vector or semantic search in the UI, admin editing, comments, bookmarks, PDF or CSV export, downloads of
papers, payments changes, or any change to prices or credits.

## 7. Acceptance

- [ ] Articles pages show the imported articles with references and SEO
- [ ] Library list and detail pages work for entitled users; locked preview for others
- [ ] Locking is enforced in api-service and proven by tests
- [ ] The own-project exception works
- [ ] `unlocksFullResearch` is on the Plan table and seeded, not hardcoded in code
- [ ] PR description lists: what already existed and was reused, the entitlement rule, and any assumption