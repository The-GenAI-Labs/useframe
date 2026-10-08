# Intake modal + Project Brief

One shared `BriefModal` (Create Project, home prompt box, Edit brief) writes a server-side **Project Brief**: every answer plus its source (`user`, `imported`, `researched`, `assumed`, `default`). A resolver fills gaps honestly, the Research tab shows and approves the brief, and the research/generation pipeline reads it only through `toPipelineInput`.

## §3 findings (inspected before building)

| # | Area | What exists | Effect on the plan |
|---|---|---|---|
| 1 | Create flow | `CreateProjectModal` (2-step name/site type → `ProjectForm`), `MinimalCreateProjectModal` (home "guided setup", `/extract` → `/plan` SSE). `POST /api/projects` takes the legacy field body; its only other callers were `ChatHomeView`'s clarify chat. No component named `EntryPathSelector`; the "How would you like to start?" step played that role. | Both modals, `ProjectForm` and `ExtractFlowPanel` are replaced by `BriefModal`; the legacy body still works and gets a minimal brief. |
| 2 | Home idea box | Logged out: `WorkspacePreview` stores the idea in `pendingPromptStore` (localStorage) and redirects to `/signin` (a redirect, not a popup). Logged in: `ChatHomeView` runs `/clarify`. `/extract` **requires login** (`verifyToken`). | Idea → `BriefModal` with `ideaText`; no model call before sign-in. `/extract`, `/extract/answer`, `extractStore`, `extract.service`, `usePlanStream` and `planStore` are left in place and now unused; a follow-up can delete them. **Existing bug:** `/extract` trusts `tier` from the request body, so any caller can request the paid model. |
| 3 | Project columns | `startupIdea`, `niche`, `targetAudience` feed `PlanService.generate` → orchestrator `/plan/sync` and the website `/generate` request. `inputType`/`sourceUrl` trigger a scan in `createProject`. `docsKey` and `logoUrl` are unused. | `syncProjectFromBrief` keeps them derived. `logoUrl` stays unset: there is no public asset storage. |
| 4 | "Phase 1" | `ResearchIntake` table exists but nothing writes it. `retrieveForProject` exists (rag/research-service) but no route calls it. No Call 1/Call 2, closed section registry or niche classifier as described. RESEARCH starts when `ResearchTab` sees `researchStatus = PENDING` and calls `POST /research/generate` → `/plan/sync` (planner = layout decision). Website = `/generate` → structure/copy/design/critique agents. | The brief hooks into those real stages (see "How the pipeline reads the brief"). |
| 5 | Uploads | **None.** No signed URLs, GCS or S3 in the API; R2 only inside deploy-service for site artifacts. | Uploads are stored in a new `brief_uploads` table (bytes, private) and logos are served through HMAC-signed 10-minute URLs. One direct upload request replaces "start + complete". |
| 6 | Rate limiter | Redis counters: `dailyRateLimit`, `hourlyRateLimit` (per user), `dailyRateLimitByIp`. | Added `minuteRateLimit` and a `Retry-After` header on every 429. |
| 7 | URL capture | Playwright scans (`worker/scan.processor.ts`) have **no SSRF protection**: no private/metadata IP blocking and no redirect re-checks. | New `safeFetch` for pre-fill only (https, DNS-pinned connection, blocks private/link-local/metadata/ULA/multicast v4+v6, re-checks each of ≤3 redirects, 443 only, 2 MB, 15 s, no cookies). **The existing scan path still needs the same fix.** |
| 8 | Model routing | `getModelForTier` (free → DeepSeek flash with high reasoning, paid → Claude). No cheap-call helper. | Added `getCheapModel()` (DeepSeek flash without reasoning, Haiku fallback). DeepSeek doesn't reliably honour the AI SDK's JSON-object mode, so the brief agents use `generateText` plus JSON extraction, like the other agents. |
| 9 | site-builder | No section registry: sections are the `SectionSchema` enum. **Text was interpolated raw into generated JSX** (`<h1>${headline}</h1>`), so any `{...}` or markup in copy became code. No form handler. English only. | All text is emitted as JS string literals, hrefs go through `safeHref`, `<title>`/CSS inputs are sanitized. `BUILDER_CAPABILITIES = { formHandler: false, legalPages: false, languages: ["en"] }`. |
| 10 | Web | Radix/shadcn Dialog, Input, Textarea, Switch, Tabs; react-hook-form present but forms are hand-rolled; TanStack Query; `useSSE`. `sonner` Toaster existed but wasn't mounted. | Reused all of these; mounted `<Toaster />` in the authenticated layout. |
| 11 | Gate | `GenerateService.authorize()` runs inside `POST /api/projects` and **consumes the free generation or deducts credits at project creation**. Research approval deducts `RESEARCH_CREDIT_COST`. | Unchanged. See conflict A. |
| 12 | Service calls | API → orchestrator with the user's access token (`Authorization: Bearer`, re-signed by the API); research-service uses `x-internal-secret`. | The brief resolve/pre-fill calls follow the orchestrator pattern. |

## Conflicts flagged (existing behaviour kept)

- **A. Gate at approve.** The gate already charges at project creation. Running it again at approve would double-charge, so approve does not call it. It flips the brief to `APPROVED`, and research then starts through the existing entry point (`ResearchTab` → `/research/generate`). `PlanService.generate` refuses with `409 BRIEF_NOT_APPROVED` until then. If the gate refuses at create, the draft stays a `DRAFT`.
- **B. Proof attestation on drafts.** Permission/attestation are enforced on submit and on every write to an attached brief, but not during draft autosave. Otherwise a half-entered testimonial couldn't be saved.
- **C. Routes use `:slug`.** `/api/projects/:slug/brief…` instead of `:id`, matching every other project route.
- **D. Stale detection.** `ProjectVersion.briefRevisionId` is stamped with the latest revision (`APPROVED` or `EDITED`) when website generation starts, so regenerating after an edit clears the banner.
- **E. Competitor scanning / researched write-back.** Only the SSE `/plan` route scans competitors and produces `seoKeywords`, and it was used only by the removed `MinimalCreateProjectModal`. User competitors are scanned first there and results are written back to blank `competitors`/`targetKeywords`. The active `/plan/sync` path has no scanning, so no write-back happens in today's UI. Adding scans there would change research cost and wasn't done.
- **F. Legacy create body.** It builds an `APPROVED` brief marked `resolution.origin = "legacy"`. The pipeline keeps reading those projects' own columns until the brief is edited.
- **G. Pre-fill never imports `trustedBy`.** A company named on a page isn't evidence it is a customer. Testimonials need the quote and name verbatim in the source, metrics need value and label verbatim, and plans need name and price verbatim. All imported proof needs the user's tick.
- **H. `CONTACT` sections** require public contact details; `TEAM` is always excluded.

## How the pipeline reads the brief

`loadBriefContext` (orchestrator) loads an `APPROVED` brief owned by the caller and calls `toPipelineInput`.

- **Planner (`/plan/sync`, `/plan`):** brief facts plus "only facts in the brief" rule, plus a section menu filtered by `SECTION_REQUIRES_BRIEF`; `layout.sections` is filtered again deterministically.
- **Structure:** same menu and filter; honours `siteType`.
- **Copy:** facts plus rule. `TESTIMONIALS`/`PRICING` content is built from the user's data verbatim, with no model call.
- **After critique:** `applyBriefToSpec` sets the user's CTA label/href (through `safeHref`), mailto for public contact, and strips sentences naming competitors unless comparison is allowed.

Sections excluded when unmet: `TESTIMONIALS` (no attested, permitted quotes), `PRICING` (no `SHOW_PLANS` plans), `CONTACT` (no public contact), `TEAM` (no data source yet). Projects without a brief generate exactly as before, including the copy agent writing testimonials.

## Data model (migration `20261008000000_project_brief`, additive only)

`ProjectBrief`, `BriefRevision`, `BriefUpload` (new: upload bytes, nullable `expiresAt`), `ProjectVersion.briefRevisionId` (FK, `SET NULL`), enums `BriefStatus`/`BriefMode`. `ProjectBrief.resolution` (new JSON) holds the resolver notice and dropped fields. `ResearchIntake` is untouched.

The migration was applied only to a throwaway local pgvector container. **It has not been applied to the Neon database the services use.** That database is also missing `20261005000000_custom_domains`. `prisma migrate diff` also shows pre-existing drift that this migration deliberately excludes (HNSW/search-vector indexes, `users_phone_key`, `users_status_idx`, a renamed index).

## Not built / gaps

- **Product analytics events:** no analytics mechanism exists in the app.
- **`/internal/briefs/stats`:** no admin surface exists.
- **Langfuse:** spans come from AI SDK telemetry (`brief.prefill` records no inputs/outputs; `brief.resolve` sees only the LLM-safe view). Langfuse itself isn't wired yet.
- **Web e2e (Playwright + axe):** no e2e setup exists in `apps/web`. Accessibility is built in (Radix focus trap/return, labelled fields, `aria-describedby` help/errors, live region, radio/checkbox chips, Move up/Move down, mobile full-screen sheet) but is not automatically audited.
- **URL pre-fill fetches raw HTML** (no JS rendering), so single-page-app sites yield little text.
- **ESLint can't run:** web's config imports a missing `@repo/eslint-config`, and the server has no flat config for ESLint 9.

## Tests

- `packages/schemas` (23): catalog integrity, validators/schemes, provenance and merge policy, proof-source enforcement, claim filter, LLM-safe view, `toPipelineInput` keys, section requirements.
- `apps/orchestrator-service` (23): SSRF fixtures (loopback, metadata, private-resolving host, redirect to private IP, `file://`, port 22, IPv6/mapped), prompt-injection fixture, document extraction including a zip bomb, resolver (assume-only, never proof, retry then drop, failure → review, nothing assumed → approved, IDOR), generation pass.
- `apps/server`: upload sniffing and signed URLs (always run), plus 13 integration tests against a real local DB, run with `BRIEF_IT_DATABASE_URL=<disposable db>` (create/patch/409, field errors, IDOR 404s, pre-fill merge, logo re-encode/EXIF strip/signed URL, disguised files, submit 422, resolve → gate → approve, edit revision and proof strictness, gate refusal keeps draft, 5-draft cap, legacy body, URL rate limit with Retry-After).
- `apps/web`: generated site rendered to HTML with React: hostile text in every field produces no executable markup and no `javascript:` hrefs. This fails against the pre-change builder.
