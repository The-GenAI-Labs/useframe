# Landing quality eval

| Brief | Judge before | Judge after | Problems before | Problems after | Variants before | Variants after |
|---|---|---|---|---|---|---|
| b2b-saas | 4.6 | 8.2 | 12 | 0 | 0 | 6 |
| fintech | 5.1 | 8.7 | 13 | 0 | 0 | 6 |
| seniors-healthcare | 4.9 | 8.1 | 14 | 0 | 0 | 6 |
| kids-edtech | 5.7 | 8.1 | 11 | 0 | 0 | 6 |
| d2c-skincare | 6.1 | 7.3 | 6 | 0 | 0 | 6 |
| fitness-coach | 6.7 | 8.3 | 6 | 0 | 0 | 6 |
| legal-services | 4.3 | 8.2 | 13 | 0 | 0 | 6 |
| dev-tool | 4.1 | 8.8 | 12 | 0 | 0 | 6 |
| restaurant | 5.4 | 8.0 | 4 | 0 | 0 | 6 |
| non-profit | 5.3 | 7.7 | 11 | 0 | 0 | 6 |

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
| CUSTOM sections (no brief content exists) | 0 | 0 |
| Distinct home-page section orders (target ≥ 4) | 6 (pass) | 4 (pass) |
| Distinct variants per site | 0.0 | 6.0 |
| Contrast pass (rendered) | 10/10 | 10/10 |
| Brand colour carries readable text | 5/10 | 10/10 |
| LLM judge (1-10) | 5.2 | 8.1 |

Home-page section order per brief (after):
- b2b-saas: HERO > FEATURES > HOW_IT_WORKS > FAQ > CTA
- fintech: HERO > FEATURES > HOW_IT_WORKS > FAQ > CTA
- seniors-healthcare: HERO > HOW_IT_WORKS > FEATURES > FAQ > CTA
- kids-edtech: HERO > FEATURES > HOW_IT_WORKS > FAQ > CTA
- d2c-skincare: HERO > FEATURES > HOW_IT_WORKS > FAQ > CTA
- fitness-coach: HERO > HOW_IT_WORKS > FEATURES > FAQ > CTA
- legal-services: HERO > HOW_IT_WORKS > FEATURES > FAQ > CTA
- dev-tool: HERO > FEATURES > HOW_IT_WORKS > FAQ > CTA
- restaurant: HERO > FEATURES > FAQ > HOW_IT_WORKS > CTA
- non-profit: HERO > HOW_IT_WORKS > FAQ > FEATURES > CTA

Cost per site:
- before (free): 11.2 model calls, 7833 input + 10382 output tokens on average; 70 s median (128 s mean) per site
- after (free): 4.3 model calls, 7707 input + 16545 output tokens on average; 81 s median (80 s mean) per site
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
- Output tokens per site rose by about 60% on DeepSeek (10.4k to 16.5k): fewer calls, but each runs high-effort reasoning over a
  larger prompt (the whole page plus contracts and rules). Model calls fell from 11.2 to 4.3 per site; on the
  paid tier, where there is no reasoning budget, one copy call per page replaces one per section.
- Paid-model run (3 briefs) not done: the local Anthropic key reports "credit balance is too low". Rerun with
  `evalLanding.ts generate --variant after --tier paid --ids b2b-saas,seniors-healthcare,dev-tool`.
- Section order: the structure step follows a narrative arc chosen by business type (product-led software,
  service, consumer product, local venue, mission-driven), from the brief's product type, goal and segment or,
  without a brief, the niche and idea; the research domain pattern is passed in as supporting context. Product
  and consumer lead with features, services and missions with how it works; venues put booking steps and
  missions put ways to help right before the final ask. A second, deeper features section is added only when
  the brief lists at least four real features: on fact-free briefs it either invented capabilities or repeated
  the first section. Without brief facts no proof sections exist, so 4 distinct orders is the most these 10
  briefs can show; "before" shows 6, mostly from invented testimonial and pricing sections in different places.
- Honesty: copy may not invent capabilities, specifications, ingredients, quantities or procedures. The
  validators cannot measure that, so it is enforced in the prompts and the critique rubric only.
- Judge weak spot: "repetition" averages 5.6 (it flags the same idea restated across sections, e.g. hero and
  features). The automatic checks only catch duplicate headlines and openings, which are 0.
- CUSTOM: develop never offered it, hence 0 before. It is now available only when the brief has the user's own
  differentiators or current alternative, and its copy may use only those facts.
