# Landing quality eval

| Brief | Judge before | Judge after | Problems before | Problems after | Variants before | Variants after |
|---|---|---|---|---|---|---|
| b2b-saas | 4.6 | 8.6 | 12 | 0 | 0 | 7 |
| fintech | 5.1 | 8.2 | 13 | 0 | 0 | 7 |
| seniors-healthcare | 4.9 | 8.8 | 14 | 0 | 0 | 7 |
| kids-edtech | 5.7 | 8.3 | 11 | 0 | 0 | 7 |
| d2c-skincare | 6.1 | 8.4 | 6 | 0 | 0 | 7 |
| fitness-coach | 6.7 | 7.9 | 6 | 0 | 0 | 8 |
| legal-services | 4.3 | 8.6 | 13 | 0 | 0 | 6 |
| dev-tool | 4.1 | 8.6 | 12 | 0 | 0 | 7 |
| restaurant | 5.4 | 8.2 | 4 | 0 | 0 | 8 |
| non-profit | 5.3 | 8.2 | 11 | 0 | 0 | 7 |

| Check | Before (free) | After (free) |
|---|---|---|
| Sites generated | 10/10 | 10/10 |
| Schema valid | 10/10 | 10/10 |
| Placeholder strings | 8 | 0 |
| Empty sections | 16 | 0 |
| Limit violations | 48 | 0 |
| Banned phrases | 0 | 0 |
| Invented proof | 12 | 0 |
| Repeated headlines/openings | 10 | 0 |
| Adjacent layout repeats | 0 | 0 |
| Sites with differing primary CTA labels | 8/10 | 0/10 |
| Distinct variants per site | 0.0 | 7.1 |
| Contrast pass (rendered) | 10/10 | 10/10 |
| Brand colour carries readable text | 5/10 | 10/10 |
| LLM judge (1-10) | 5.2 | 8.4 |

Cost per site:
- before (free): 11.2 model calls, 7833 input + 10382 output tokens on average; 70 s median (128 s mean) per site
- after (free): 4.3 model calls, 8036 input + 19233 output tokens on average; 94 s median (92 s mean) per site

## Method

- Briefs: `packages/evals/datasets/landing-briefs.json` (10 niches). No intake brief or research step, so no
  user-provided proof exists: any testimonial, pricing, stats or logo section, or any customer count,
  percentage, rating or award, counts as invented.
- Generation: `apps/orchestrator-service/scripts/evalLanding.ts generate` runs structure → copy → design →
  critique in-process on the free model (DeepSeek flash, high reasoning). "Before" runs the same four agents
  and prompts from `develop`, materialised from git; "after" runs this branch. No database writes.
- Automatic checks: `pnpm --filter @repo/evals eval:landing` using the shared validators in
  `@repo/schemas` (`checkSpecQuality`, `isPlaceholder`) and the renderer palette for contrast.
- Judge: `evalLanding.ts judge` scores both variants with the same free model and the critique rubric
  (9 criteria, 1-10, averaged). A model judging its own family's output is a soft signal; the automatic
  checks are the hard one.

## Notes

- "Variants before = 0": develop's structure step never chose layout variants (the renderer picked defaults).
- Banned phrases were already 0 before on this sample, so that check shows no change here.
- Output tokens per site roughly doubled on DeepSeek: fewer calls, but each runs high-effort reasoning over a
  larger prompt (the whole page plus contracts and rules). Model calls fell from 11.2 to 4.3 per site; on the
  paid tier, where there is no reasoning budget, one copy call per page replaces one per section.
- Paid-model run (3 briefs) not done: the local Anthropic key reports "credit balance is too low". Rerun with
  `evalLanding.ts generate --variant after --tier paid --ids b2b-saas,seniors-healthcare,dev-tool`.
