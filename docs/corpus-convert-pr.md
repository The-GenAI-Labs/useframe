# Research batch converter (`corpus:convert`, `corpus:import-articles`)

Turns pasted research batches (`corpus/raw/*.json`, shape `{ findings, articles }`) into Phase 2 finding files and `ResearchArticle` rows. See "Adding research" in `docs/rag-corpus.md`.

## What changed

- `packages/rag/src`: `corpusConvert.ts` (pure transform + checks), `corpusFiles.ts` (disk IO, write rules), `corpusReport.ts` (reports, diff, URL check), `corpusArticles.ts` (article schema + upsert), `labels.ts` (label cache, slugs, provider), `convertCli.ts`. Phase 2 schema, chunker, embedding and ingestion code are untouched.
- `apps/orchestrator-service/src/routes/labels.route.ts`: `POST /internal/research/labels`, internal-secret protected, one `generateObject` call through `getCheapModel()`. It receives only `{key, claim}` and returns `{key, title, slug}`.
- Root scripts `corpus:convert` and `corpus:import-articles`; `@repo/rag` exports `./labels`.
- Tests: `packages/rag/src/corpusConvert.test.ts` (44 tests, no network, fake label provider) on a synthetic fixture in `packages/rag/src/fixtures/`.

## Enum change

`ResearchCategory` gains `MOTION` (additive migration `20261028000000_research_category_motion`: `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'MOTION'`). Mirrored in `ResearchCategoryEnum` (`packages/schemas`) and the regenerated Prisma client. The migration is not applied to any database. Any other `field` value with no enum member is reported as an error (non-zero exit); it is never mapped to `OTHER`.

## Assumptions (simplest option chosen)

- The 10 findings and 3 articles were not in the request, so the test fixture is synthetic (placeholder titles, `example.org` URLs). Run the converter on your real batches to see real results.
- Tags: `field`, `decision`, then `fits` tags by frequency across options; "then alphabetical" is applied as the tie-break within equal frequency. `appliesTo` and `audience` are not tags.
- A finding with no options omits the "Options:" block; an option with empty `fits` omits the "(fits: ...)" part. Everything else follows the fixed template.
- `title`/`slug` model labels are rejected (and replaced by the offline label, with a warning, not cached) if the title is over 90 characters or contains a number not in the claim. Names are only constrained by the prompt.
- Offline labels (`--offline`, no `INTERNAL_SERVICE_SECRET`, failed call, rejected label) are never written to `_labels.json`, so a later online run can still label them.
- An existing finding file that differs is overwritten only if its claim and source URL match the finding being written ("same key"); otherwise it is left alone and listed in `problems.md`. Files in `corpus/findings` not produced by the run are listed as orphans, never deleted.
- Duplicate claim+sourceUrl across batches are written once (first wins). Findings that only share a sourceUrl are all kept and listed.
- Near-identical claims: word-set similarity of at least 0.9.
- Article slug is the title slug (no model), cached in `_labels.json` under `sha256(title)`. A title edit therefore creates a new article unless the slug is pinned in the cache.
- Article `category` uses the same enum mapping as `field`. `sections` and `references` are passed through as given.
- `--dry-run` writes nothing (not even reports; it prints them) but still calls the label model for uncached findings. `import-articles --dry-run` reads the database to count.
- A reference matched by several titles uses the first title; the finding is flagged and listed.
- The CLI resolves `corpus/` from the repository root regardless of the working directory. `--corpus-dir <path>` overrides it (used by tests).

## Commands to run

```sh
pnpm install
pnpm --dir packages/db exec prisma migrate deploy   # applies MOTION; run against the intended database only
pnpm --filter @useframe/db build
pnpm --filter @repo/schemas build
pnpm --filter @repo/rag build
# restart the orchestrator (new /internal/research/labels route)

pnpm corpus:convert --dry-run
pnpm corpus:convert                  # add --offline to skip the model, --check-urls to probe sources
# read corpus/_review/summary.md and problems.md; fix corpus/_labels.json or corpus/raw
pnpm corpus:validate "$PWD/corpus/findings"
pnpm corpus:ingest "<absolute path to a few copied files>"
gcloud storage rsync ./corpus/findings gs://$GCS_RESEARCH_CORPUS_BUCKET/findings/
pnpm corpus:import-articles --dry-run
pnpm corpus:import-articles

pnpm --filter @repo/rag test
```

## Environment changes

None. The converter reads the existing `INTERNAL_SERVICE_SECRET` and `ORCHESTRATOR_URL` (`packages/rag/.env`, already in its `.env.example`) and `import-articles` reads `DATABASE_URL` (`packages/rag/.env`).
