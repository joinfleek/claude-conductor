<!-- Source of truth: Flotion · https://os.joinfleek.com/tools/flotion/d/fleek-api-harness-improvement
     Mirrored here so the audit survives independently of Flotion.
     If the Flotion doc moves ahead, re-sync rather than editing this copy. -->

# Fleek-api harness improvement

_Six months of fleek-api PR history mined for recurring mistakes, ranked and mapped to concrete harness fixes (AI-1b Wave 2)._

Tech Velocity Initiative · AI-1b Wave 2

# The Repeat-Mistake Ledger

Six months of `fleek-api` pull-request history, read end to end, to find the mistakes that keep coming back — and turn each one into something the review harness catches automatically, before a human has to notice it twice.

**2,368** merged PRs audited — **2026-02-22** → **2026-08-22** · **893** PRs deep-read (100%) · **67** recurring patterns found

Why this exists How we found these Fix-it-first Feature → Fix Pure bug fixes What to do next

Framing

## This isn't a scoreboard

No name, count, or ranking of any individual developer appears anywhere in this document — that's deliberate, not an oversight. Every PR in `fleek-api` was written by someone doing their job under normal review, normal deadlines, and normal blind spots. The interesting question was never "who made the mistake" — it's "which mistakes does our current review process structurally fail to catch, over and over, regardless of who's writing the code."

So this audit reads six months of real merged-PR history — both the features that needed a same-topic follow-up fix, and the plain bug fixes with no feature story behind them — and asks, for each one: is this a one-off, or is it a _class_ of mistake our harness (`CLAUDE.md`, `.claude/rules/`, CodeRabbit config, pre-commit hooks) should be catching on its own? 67 times, the answer was the latter. Each one below comes with the evidence and a concrete, ready-to-write fix.

Methodology

## How we found these

Full population, not a sample — every step below covers 100% of what it claims to, and every cap taken along the way is disclosed with a real number.

2,368 · merged PRs, 6-month window

2,366 · after excluding 2 bot-authored PRs

436/1132 · feature PRs chain-linked to a fix (100% checked)

457 · pure bug fixes, no upstream feature

893 · PRs deep-read via `gh pr view`/`diff`

559 · raw generalizable findings surfaced

67 · distinct patterns after clustering

249 · unique PRs cited as evidence

Full method, caps, and caveats

**Population.** 2,368 PRs merged into `joinfleek/fleek-api` between 2026-02-22 and 2026-08-22, pulled via `gh pr list` in six date-bounded monthly chunks (GitHub's search API caps any single query at 1,000 results) and deduplicated — no overlap found. This repo runs no release-please/semantic-release automation, so exclusion was minimal: 2 of 2,368 PRs are bot-authored and were dropped.

**Classification (100% coverage).** Every PR was labeled feat/fix/chore/docs/refactor/perf/ci/revert/test/other — by conventional-commit title prefix where present (1,673 PRs), else by branch-name action prefix (440 PRs), else by a diff-shape heuristic calibrated against the labeled set (fix median = 2 files / 27 line additions; feat median = 4 files / 137 additions) for the 253 PRs with neither signal. Only 2.6% of titles carry a ticket ID, so ticket-based chaining was a minor signal, not the primary one.

- feat 1132 · fix 873 · chore 135 · docs 60 · refactor 46 · perf 43 · ci 31 · revert 22 · other 22 · test 2

**Chain-linking (100% of feature PRs checked).** All 1,132 feature PRs were checked against all 873 fix PRs merged within 60 days after them, via a shared ticket ID or same-author-plus-overlapping-files (125 high-frequency "noisy" files — schema/codegen/migration-registry — excluded from overlap so a match reflects real shared feature code). 436 feature PRs got at least one linked fix; the rest of the fix population (457) had no upstream chain and became the "pure bug fix" lane. Chains were capped at the 5 highest-confidence links per feature PR for the deep-read step — 44 of the 436 chains exceeded that and were truncated, disclosed here rather than silently dropped.

**Deep-read (100% coverage, no sampling).** Every one of the 436 feature-chain pairs and all 457 pure bug fixes were individually read — not sampled — via `gh pr view` (title, body, comments, reviews, files, commits) and `gh pr diff`, by 893 independent agents running in parallel, each judging whether the fix represented a genuinely generalizable class of mistake or a one-off. A final synthesis pass clustered the 559 raw findings into the 67 patterns below, ranked by how many raw findings support each one.

**Read with one caveat:** 63% of individual deep-reads (559 of 893) returned a raw finding — a high hit rate. Individual finding-agents ran independently with no cross-agent calibration, so some raw findings likely reflect eager pattern-matching on ordinary, non-systemic fixes. The clustering step is the higher-confidence signal below; treat any pattern with frequency 1 as a lead worth a manual second read, not a settled fact.

Single biggest signal

Feature → Fix · 8 supporting findings · 15 PRs

### Kysely pinned-version (0.23.5) API mismatch

Code is repeatedly written using Kysely query-builder APIs (callable expression-builder eb(col,op,val)/eb.or([...]), fn.count/fn.sum aggregate builders, .filterWhere()) that only exist in Kysely ≥0.27, while this repo pins kysely@0.23.5. It type-checks cleanly (types don't reflect the pinned runtime) and mocked unit tests never invoke the real builder callback, so it only fails at runtime — a TypeError thrown on every invocation, discovered via production incidents.

Recommended fixAdd a deterministic pre-commit/CI grep check across packages/functions/src/model and src/data that flags `.where((eb) =>` combined with callable `eb(` or `eb.or(`/`eb.and(`, and any `fn.count(`/`fn.sum(`/`.filterWhere(` usage, failing with a pointer to the compatible `sql` template-literal / `.where(qb => qb.where().orWhere())` pattern already used elsewhere. Document the 0.23.5 pin and banned APIs in CLAUDE.md's Kysely gotcha section.

[#6718](https://github.com/joinfleek/fleek-api/pull/6718)[#8480](https://github.com/joinfleek/fleek-api/pull/8480)[#8510](https://github.com/joinfleek/fleek-api/pull/8510)[#8459](https://github.com/joinfleek/fleek-api/pull/8459)[#8574](https://github.com/joinfleek/fleek-api/pull/8574)[#8583](https://github.com/joinfleek/fleek-api/pull/8583)[#8582](https://github.com/joinfleek/fleek-api/pull/8582)[#8589](https://github.com/joinfleek/fleek-api/pull/8589)[#8525](https://github.com/joinfleek/fleek-api/pull/8525)[#8287](https://github.com/joinfleek/fleek-api/pull/8287)[#8576](https://github.com/joinfleek/fleek-api/pull/8576)[#8326](https://github.com/joinfleek/fleek-api/pull/8326)[#8327](https://github.com/joinfleek/fleek-api/pull/8327)[#9578](https://github.com/joinfleek/fleek-api/pull/9578)[#9581](https://github.com/joinfleek/fleek-api/pull/9581)

Where the leverage is

## Fix-it-first roadmap

Every pattern below already comes with a recommended enforcement level. Grouping by level answers the practical question: what's cheap to ship this week, and what needs a harder gate?

Pre-commit / CIA deterministic script blocks the commit or the CI run outright — the hardest gate.

18

Rule docWrite it into CLAUDE.md / .claude/rules — cheapest to ship, relies on the author reading it.

25

CodeRabbitA review-time instruction to CodeRabbit — for judgment calls a static check can't make.

15

Claude hookA non-blocking PostToolUse hook nudges the author at edit time.

9

### The 10 most-repeated patterns

Ranked by how many independent PRs support them — across both lenses.

Kysely pinned-version (0.23.5) API mismatchFeature→Fix · Pre-commit / CI

8

Shared multi-branch pipeline/dispatcher updated in only one branchFeature→Fix · Rule doc

7

No CI gate for typecheck/lint/tests before mergePure bug · Pre-commit / CI

7

Missing grep-all-callers when adding a filter/field/behavior to a shared entityFeature→Fix · Rule doc

6

FleekTracer.error used for expected/business-level failures, polluting alert dashboardsPure bug · Rule doc

5

Silent bail-out / early return with no logging on the failure branchPure bug · Rule doc

5

CDN URL rewrite missing or inconsistently applied to asset URLsPure bug · Rule doc

5

Raw headers/credentials/context logged verbatim into FleekTracer or SlackPure bug · Claude hook

4

Migration table/FK/index integrity gaps (wrong table name, missing index, missing PK)Pure bug · Pre-commit / CI

4

External API error catch logs only error.message, discarding response status/bodyPure bug · CodeRabbit

4

**Rule doc** — Pre-commit / CI · CodeRabbit · Claude hook

Lens 1 of 2

## Feature → Fix findings

436 feature PRs that needed a same-topic follow-up fix within 60 days — the richest signal, because it shows exactly what shipped-and-reviewed code still missed. 100% deep-read, clustered into 35 patterns below, ranked by frequency.

8 · findings · Pre-commit / CI

### 1. Kysely pinned-version (0.23.5) API mismatch

dependency-compatibility

Code is repeatedly written using Kysely query-builder APIs (callable expression-builder eb(col,op,val)/eb.or([...]), fn.count/fn.sum aggregate builders, .filterWhere()) that only exist in Kysely ≥0.27, while this repo pins kysely@0.23.5. It type-checks cleanly (types don't reflect the pinned runtime) and mocked unit tests never invoke the real builder callback, so it only fails at runtime — a TypeError thrown on every invocation, discovered via production incidents.

Recommended fix Add a deterministic pre-commit/CI grep check across packages/functions/src/model and src/data that flags `.where((eb) =>` combined with callable `eb(` or `eb.or(`/`eb.and(`, and any `fn.count(`/`fn.sum(`/`.filterWhere(` usage, failing with a pointer to the compatible `sql` template-literal / `.where(qb => qb.where().orWhere())` pattern already used elsewhere. Document the 0.23.5 pin and banned APIs in CLAUDE.md's Kysely gotcha section.

[#6718](https://github.com/joinfleek/fleek-api/pull/6718)[#8480](https://github.com/joinfleek/fleek-api/pull/8480)[#8510](https://github.com/joinfleek/fleek-api/pull/8510)[#8459](https://github.com/joinfleek/fleek-api/pull/8459)[#8574](https://github.com/joinfleek/fleek-api/pull/8574)[#8583](https://github.com/joinfleek/fleek-api/pull/8583)[#8582](https://github.com/joinfleek/fleek-api/pull/8582)[#8589](https://github.com/joinfleek/fleek-api/pull/8589)[#8525](https://github.com/joinfleek/fleek-api/pull/8525)[#8287](https://github.com/joinfleek/fleek-api/pull/8287)[#8576](https://github.com/joinfleek/fleek-api/pull/8576)[#8326](https://github.com/joinfleek/fleek-api/pull/8326)[#8327](https://github.com/joinfleek/fleek-api/pull/8327)[#9578](https://github.com/joinfleek/fleek-api/pull/9578)[#9581](https://github.com/joinfleek/fleek-api/pull/9581)

7 · findings · Rule doc

### 2. Shared multi-branch pipeline/dispatcher updated in only one branch

incomplete-propagation

A function that dispatches to multiple structurally-parallel branches (product-source type, cart-primitive entry point, shipping calculator path) gets a fix/feature applied to only the branch the author was looking at, leaving sibling branches on stale logic — pricing, cart totals, or eligibility silently diverge between the 'fixed' and 'forgotten' branch.

Recommended fix Add an L1 rule requiring that any change to one arm of an if/else-if/switch dispatch (or one call site of a shared cart/pricing primitive) be accompanied by an explicit audit of every sibling arm/call-site in the same file or domain; extract the changed logic into one shared helper called from all arms instead of duplicating it per-branch. Back with a non-blocking PostToolUse hook that flags when a diff edits one arm of a multi-branch dispatch function without touching the others.

[#9030](https://github.com/joinfleek/fleek-api/pull/9030)[#8496](https://github.com/joinfleek/fleek-api/pull/8496)[#9108](https://github.com/joinfleek/fleek-api/pull/9108)[#8785](https://github.com/joinfleek/fleek-api/pull/8785)[#8786](https://github.com/joinfleek/fleek-api/pull/8786)[#8558](https://github.com/joinfleek/fleek-api/pull/8558)[#9107](https://github.com/joinfleek/fleek-api/pull/9107)[#9441](https://github.com/joinfleek/fleek-api/pull/9441)[#9184](https://github.com/joinfleek/fleek-api/pull/9184)[#9719](https://github.com/joinfleek/fleek-api/pull/9719)

6 · findings · Rule doc

### 3. Missing grep-all-callers when adding a filter/field/behavior to a shared entity

incomplete-filter-coverage

A new filter, field, or business rule is added to one resolver/query that reads an entity (list view, create path) but the identical entity is also read by a sibling resolver (detail view, update path, batch path) that never receives the same treatment, so restricted/updated/nullable data leaks through the unguarded sibling until a follow-up incident forces a second PR.

Recommended fix When adding a visibility filter, nullable-field relaxation, or new field to a shared entity's response, grep for every resolver/handler/presenter that reads or returns that entity type (list AND detail, create AND update) and apply the change to all of them in the same PR, or explicitly justify exemption in the PR description. Enforce via CodeRabbit instruction flagging PRs that touch only list-style or only create-style resolvers for a shared entity.

[#6777](https://github.com/joinfleek/fleek-api/pull/6777)[#6780](https://github.com/joinfleek/fleek-api/pull/6780)[#7445](https://github.com/joinfleek/fleek-api/pull/7445)[#7157](https://github.com/joinfleek/fleek-api/pull/7157)[#7317](https://github.com/joinfleek/fleek-api/pull/7317)[#7821](https://github.com/joinfleek/fleek-api/pull/7821)[#8206](https://github.com/joinfleek/fleek-api/pull/8206)[#7654](https://github.com/joinfleek/fleek-api/pull/7654)[#8113](https://github.com/joinfleek/fleek-api/pull/8113)[#7042](https://github.com/joinfleek/fleek-api/pull/7042)[#8690](https://github.com/joinfleek/fleek-api/pull/8690)

3 · findings · Rule doc

### 4. Unguarded JSON.parse on JSONB DB columns that may already be parsed

unsafe-json-parse-on-db-columns

Code calls JSON.parse() directly on a value read from a JSONB/metafield column, assuming it's always a string, but the RDS Data API / driver can return it already parsed as an object depending on the query shape — crashing with 'is not valid JSON' or silently mis-handling the value.

Recommended fix Add a shared safeJsonParse<T>(value) utility that guards with typeof value === 'string' before parsing, document it in CLAUDE.md's Kysely-gotcha section, and require any new DB-sourced JSON read to call it instead of raw JSON.parse.

[#7214](https://github.com/joinfleek/fleek-api/pull/7214)[#7218](https://github.com/joinfleek/fleek-api/pull/7218)[#7206](https://github.com/joinfleek/fleek-api/pull/7206)[#7018](https://github.com/joinfleek/fleek-api/pull/7018)[#7020](https://github.com/joinfleek/fleek-api/pull/7020)

3 · findings · Rule doc

### 5. Money mixed across currencies without conversion (bundle-split shipping/VBP)

currency-unit-mixing

Bundle-splitting price/VBP/shipping calculations combined GBP-denominated product metafield values with Shopify order money fields (shopMoney/presentmentMoney) in the order's own currency, with no conversion step, silently producing wrong totals for every non-GBP order until three separate follow-up PRs added conversion, fixed rounding order, and corrected which money field to read.

Recommended fix Add an L1 rule requiring any arithmetic combining a metafield/DB-sourced price with a Shopify order money field to go through convertAmount() first, and require test coverage for at least one non-default-currency order scenario in the grill-use-cases checklist whenever a plan touches Shopify money fields.

[#7435](https://github.com/joinfleek/fleek-api/pull/7435)[#7040](https://github.com/joinfleek/fleek-api/pull/7040)[#7152](https://github.com/joinfleek/fleek-api/pull/7152)[#7671](https://github.com/joinfleek/fleek-api/pull/7671)[#7793](https://github.com/joinfleek/fleek-api/pull/7793)[#7806](https://github.com/joinfleek/fleek-api/pull/7806)

3 · findings · Rule doc

### 6. Duplicated implementation instead of reusing existing code

reuse-duplication

A new function/field-format/query is hand-written from scratch when an existing presenter, method, or record already sitting in scope does the same job, so a later formatting/behavior change requires hunting down every duplicate site instead of editing one place.

Recommended fix Extend the reuse-before-authoring rule with a CodeRabbit instruction: when a diff introduces a derived value, query, or lookup that duplicates logic already present elsewhere in the file/module (or an already-fetched record is re-queried by id), flag it and require extraction into one shared function/presenter.

[#6527](https://github.com/joinfleek/fleek-api/pull/6527)[#6698](https://github.com/joinfleek/fleek-api/pull/6698)[#6453](https://github.com/joinfleek/fleek-api/pull/6453)[#6477](https://github.com/joinfleek/fleek-api/pull/6477)[#6828](https://github.com/joinfleek/fleek-api/pull/6828)[#6956](https://github.com/joinfleek/fleek-api/pull/6956)

3 · findings · CodeRabbit

### 7. New/extended validator doesn't carry over sibling's existing checks

validation-parity-gap-on-duplicated-code

When a new validator, batch-lookup method, or actor-identity guard is added beside an existing sibling that validates the same kind of field, the new one omits a check the original has (dimension bound, case-insensitivity, trim-empty-string), because it was hand-typed instead of copying the sibling's full validation.

Recommended fix CodeRabbit instruction: when a diff adds a validator/method structurally parallel to an existing sibling (same table, same kind of field, a batch variant of a singular method), diff the two functions' checks and flag any constraint present in the sibling but missing from the new one.

[#6642](https://github.com/joinfleek/fleek-api/pull/6642)[#7496](https://github.com/joinfleek/fleek-api/pull/7496)[#7118](https://github.com/joinfleek/fleek-api/pull/7118)[#7376](https://github.com/joinfleek/fleek-api/pull/7376)[#7743](https://github.com/joinfleek/fleek-api/pull/7743)[#7744](https://github.com/joinfleek/fleek-api/pull/7744)[#7750](https://github.com/joinfleek/fleek-api/pull/7750)[#7751](https://github.com/joinfleek/fleek-api/pull/7751)[#7747](https://github.com/joinfleek/fleek-api/pull/7747)[#7899](https://github.com/joinfleek/fleek-api/pull/7899)

3 · findings · CodeRabbit

### 8. Silent fallback / unlogged default on unrecognized lookup value

unsafe-fuzzy-lookup-with-silent-fallback

A lookup against a hardcoded map or enum (vendor origin country, destination zone code, currency) falls back to a plausible-looking default with no error or log when the key isn't found, so bad/new data silently produces wrong business results (wrong shipping rate, wrong price) instead of failing loudly.

Recommended fix Require exact, normalized-key lookups (never LIKE '%x%' substring matching) with any catch-and-default-on-miss path logged at error/alert level naming the unmatched key, and require validating admin-writable columns against the same enum used to read them rather than a separate compile-time allowlist.

[#7055](https://github.com/joinfleek/fleek-api/pull/7055)[#7127](https://github.com/joinfleek/fleek-api/pull/7127)[#7133](https://github.com/joinfleek/fleek-api/pull/7133)[#7147](https://github.com/joinfleek/fleek-api/pull/7147)[#7189](https://github.com/joinfleek/fleek-api/pull/7189)[#9111](https://github.com/joinfleek/fleek-api/pull/9111)[#9558](https://github.com/joinfleek/fleek-api/pull/9558)[#9594](https://github.com/joinfleek/fleek-api/pull/9594)

3 · findings · CodeRabbit

### 9. SQL aggregate silently multiplied by LEFT JOIN fan-out

aggregate-query-join-fanout

A SUM/COUNT/array_agg is added to a query that JOINs a many-to-many mapping table (box_order_mapping, line_item_boxes) without checking the join can't produce more than one row per group, so every aggregate in the SELECT — not just the new one — gets silently multiplied whenever a box/entity is shared across multiple orders.

Recommended fix CodeRabbit instruction: flag any aggregate function (SUM/COUNT/array_agg without DISTINCT) added to a query that JOINs a linking/mapping table, requiring the author to confirm the join can't yield multiple rows per GROUP BY key, or use a dedup subquery/IN-clause instead of a direct join before aggregating.

[#6764](https://github.com/joinfleek/fleek-api/pull/6764)[#6815](https://github.com/joinfleek/fleek-api/pull/6815)[#6728](https://github.com/joinfleek/fleek-api/pull/6728)[#7846](https://github.com/joinfleek/fleek-api/pull/7846)[#8018](https://github.com/joinfleek/fleek-api/pull/8018)[#8024](https://github.com/joinfleek/fleek-api/pull/8024)

2 · findings · CodeRabbit

### 10. SST/CDK prop shape wrong, any-cast masks type error, silently drops config

unjustified-any-cast-masking-broken-cdk-shape

A hand-rolled inline object replaces an existing typed helper for SST/CDK construct props (VPC config for a Job), placing props at the wrong nesting level and using `as any` casts to silence the resulting type errors — SST silently drops the misplaced props at deploy time with no error, until a production job fails to reach its VPC-bound resource.

Recommended fix CodeRabbit instruction: flag any new `as any` cast on props passed to an SST construct, requiring confirmation the prop is nested correctly per the construct's type definition and that an existing typed helper (e.g. getVpcJobCdkProps) wasn't available to reuse instead of hand-rolling the object.

**[#7414](https://github.com/joinfleek/fleek-api/pull/7414)** — [#7409](https://github.com/joinfleek/fleek-api/pull/7409) · [#8081](https://github.com/joinfleek/fleek-api/pull/8081) · [#8136](https://github.com/joinfleek/fleek-api/pull/8136)

2 · findings · Rule doc

### 11. State-machine/queue idempotency gaps on replayed or duplicate events

missing-event-idempotency-in-new-state-machine

A new state-machine event processor or fulfillment-sync path has no no-op guard for events targeting a state the entity already passed, so out-of-order or replayed webhook/queue events throw INVALID_TRANSITION or corrupt state, requiring repeated patches across multiple related state machines (fulfillment, batch, line-item).

Recommended fix Require every new state-machine event consumer to include an explicit progression/already-transitioned no-op guard before merge, especially when fed by at-least-once sources (SQS, webhooks, migration replay); extract the progression map into one shared module reused by all sibling state machines instead of duplicating it per machine.

[#6428](https://github.com/joinfleek/fleek-api/pull/6428)[#7025](https://github.com/joinfleek/fleek-api/pull/7025)[#7028](https://github.com/joinfleek/fleek-api/pull/7028)[#7034](https://github.com/joinfleek/fleek-api/pull/7034)[#6987](https://github.com/joinfleek/fleek-api/pull/6987)[#7026](https://github.com/joinfleek/fleek-api/pull/7026)

1 · finding · CodeRabbit

### 12. Hardcoded test-user/account ID used as a production feature gate

hardcoded-test-user-as-feature-gate

An in-progress feature is gated by comparing the caller's userId to a hardcoded literal constant instead of a feature flag, smuggled into an unrelated PR, and persists for months before proper LaunchDarkly gating replaces it.

Recommended fix Add an L1 rule forbidding branching production logic on a literal/hardcoded account ID; require LaunchDarkly gating for unreleased features, and flag any new `*_TEST_USER_ID` constant in review as needing justification or removal.

**[#6689](https://github.com/joinfleek/fleek-api/pull/6689)** — [#6976](https://github.com/joinfleek/fleek-api/pull/6976) · [#6966](https://github.com/joinfleek/fleek-api/pull/6966) · [#8381](https://github.com/joinfleek/fleek-api/pull/8381)

1 · finding · Rule doc

### 13. Money-moving cron shipped with no runtime kill switch

money-moving-cron-no-kill-switch

An auto-refund/payout cron went live with no feature-flag or env-var gate, so when it misbehaved in production the only way to stop it was two emergency PRs commenting out the execution loop and redeploying.

Recommended fix Require any new cron/consumer/handler that autonomously moves money to be gated by a runtime-checked kill switch read at the top of the handler before the processing loop, never a code comment-out as the disable mechanism.

**[#6654](https://github.com/joinfleek/fleek-api/pull/6654)** — [#6726](https://github.com/joinfleek/fleek-api/pull/6726) · [#6727](https://github.com/joinfleek/fleek-api/pull/6727)

1 · finding · CodeRabbit

### 14. Aggregate sum assigned directly to a per-unit field without dividing by count

aggregate-per-unit-arithmetic

Bundle price propagation summed piece prices into a running total and assigned that raw sum directly to a `pricePerUnit`-named field with no division by piece count, and the feature's own tests encoded the wrong (sum, not average) value as expected, so it shipped and caused ~5x price inflation before being caught twice more.

Recommended fix Require any aggregate-then-assign-to-a-per-unit-field pattern to include an explicit division by a count drawn from the same filtered set as the sum, and require unit tests to show the expected value as sum/count (not a bare literal) so a reviewer can verify division happened.

**[#6581](https://github.com/joinfleek/fleek-api/pull/6581)** — [#6605](https://github.com/joinfleek/fleek-api/pull/6605) · [#7260](https://github.com/joinfleek/fleek-api/pull/7260)

1 · finding · Claude hook

### 15. Unsafe `as any` cast masks a nonexistent/invalid property access

unsafe-any-cast-masks-invalid-property

A property access is cast through `as any` to silence a compile error, and the property turns out not to exist on the underlying type, silently defaulting via a fallback (`\|\| 'GB'`) for every invocation with no runtime signal.

Recommended fix Add a PostToolUse hook that greps new/changed lines for a property access immediately following an `any` cast and nudges the author to verify the property exists on the underlying type before merging, especially when a silent fallback follows.

**[#6640](https://github.com/joinfleek/fleek-api/pull/6640)** — [#6833](https://github.com/joinfleek/fleek-api/pull/6833)

1 · finding · CodeRabbit

### 16. GraphQL field removed from wrong schema during monolith/service split

graphql-schema-split-misclassification

When splitting operations out of a monolith GraphQL schema into a restricted staff-only schema, a general-access field was misclassified as staff-only and deleted from the general schema, cutting off its real (non-staff) callers.

Recommended fix When a field is deleted from one schema as part of a split, require verifying the resolver's actual auth requirement matches the destination endpoint's access model and searching for existing non-admin callers before allowing removal.

**[#6744](https://github.com/joinfleek/fleek-api/pull/6744)** — [#6760](https://github.com/joinfleek/fleek-api/pull/6760)

1 · finding · Pre-commit / CI

### 17. Hand-split stack/schema loses parity with the source it was copied from

stack-split-parity-drift

Splitting a stack/schema into a new dedicated file by hand-copying pieces of the original leaves operations, resource bindings, and asset copyFiles behind, requiring four separate follow-up PRs to restore parity.

Recommended fix Add a deterministic check that diffs Query/Mutation field lists and bind/copyFiles arrays between the source and split stack/schema before merge, so missing bindings are caught mechanically rather than via runtime discovery.

[#6732](https://github.com/joinfleek/fleek-api/pull/6732)[#6747](https://github.com/joinfleek/fleek-api/pull/6747)[#6751](https://github.com/joinfleek/fleek-api/pull/6751)[#6782](https://github.com/joinfleek/fleek-api/pull/6782)[#6760](https://github.com/joinfleek/fleek-api/pull/6760)

1 · finding · Claude hook

### 18. CSV/spreadsheet numeric cells trusted as native number type

csv-numeric-coercion

Numeric fields sourced from CSV upload rows are typed as `number` and gated with `typeof x === 'number'`, but CSV cells arrive as strings, so values are silently dropped or produce NaN — fixed three times in the same handler within two months.

Recommended fix Require any value read from a CSV row that feeds a number-typed field to be explicitly coerced with Number()/parseFloat() guarded against NaN at the assignment site, never gated by a typeof-number runtime check.

**[#6407](https://github.com/joinfleek/fleek-api/pull/6407)** — [#7301](https://github.com/joinfleek/fleek-api/pull/7301) · [#7339](https://github.com/joinfleek/fleek-api/pull/7339)

1 · finding · Claude hook

### 19. New service/model/presenter layer shipped with zero tests despite reviewer flag

untested-new-service-layer

New business-logic files (service, model, presenter) merged with no test coverage even after the automated reviewer explicitly asked for tests twice, and two downstream bugs in that exact code were later found only via production incidents.

Recommended fix Add a PostToolUse hook that fires when a new file under data/, model/, or presenter/ exports a class with methods and no test file imports it, nudging the author to add coverage for write paths before merge.

**[#6331](https://github.com/joinfleek/fleek-api/pull/6331)** — [#6556](https://github.com/joinfleek/fleek-api/pull/6556) · [#6766](https://github.com/joinfleek/fleek-api/pull/6766)

1 · finding · Pre-commit / CI

### 20. Commented-out dead code left in place instead of deleted

commented-out-dead-code

A refactor replaces logic but leaves the old implementation commented out beside the replacement; the automated reviewer flagged it, the PR merged anyway, and the dead code is still on main.

Recommended fix Add a pre-commit/CI check that flags a hunk where an old implementation is left as a comment directly beside its replacement instead of being deleted, and require removal before merge — git history is the record, not inline comments.

[#7478](https://github.com/joinfleek/fleek-api/pull/7478)

1 · finding · Claude hook

### 21. DB transaction wraps an external payment-gateway network call

db-transaction-wraps-external-call

A checkout flow wrapped Stripe/PayPal calls inside `DB.transaction().execute(...)`, holding a DB transaction open across outbound HTTP calls, directly contradicting the documented 'transactions unless external call involved' rule.

Recommended fix Add a PostToolUse hook that flags a `DB.transaction()` callback whose body is passed into or calls a function under handler/payment/ or that imports an HTTP client, requiring the transaction be scoped only around the DB portion, never around the external call.

**[#7440](https://github.com/joinfleek/fleek-api/pull/7440)** — [#7487](https://github.com/joinfleek/fleek-api/pull/7487)

1 · finding · Rule doc

### 22. Reused/extended function inherits a latent invariant bug from its existing code path

reused-path-inherits-latent-bug

A caller-impact audit checked whether wiring a new entity type into an existing shared read/write path would create duplication risk, but never verified the existing path was already correct for the entity type it currently serves, so the new type inherited a pre-existing staleness bug.

Recommended fix Add a required ERD audit column: 'does this path assume a status/liveness field stays in sync via explicit-trigger only, or is there periodic reconciliation? If explicit-trigger-only, extending this path inherits its staleness risk — call it out explicitly.'

**[#7325](https://github.com/joinfleek/fleek-api/pull/7325)** — [#7934](https://github.com/joinfleek/fleek-api/pull/7934)

1 · finding · Pre-commit / CI

### 23. Feature flag hardcoded to true by an unrelated PR, defeating the flag's purpose

dead-code-bypasses-existing-safety-test

A fail-closed feature-flag helper with its own regression test was silently neutralized by an unrelated PR inserting an unreachable `return true;` before the flag logic, undetected because eslint has no no-unreachable rule and CI's test-selection only runs tests that were themselves edited.

Recommended fix Add `no-unreachable: 'error'` to eslint config, and fix CI's changed-test-selection logic to also run tests that cover a changed source file by naming convention, not only tests that were literally edited in the diff.

**[#7418](https://github.com/joinfleek/fleek-api/pull/7418)** — [#7614](https://github.com/joinfleek/fleek-api/pull/7614) · [#7998](https://github.com/joinfleek/fleek-api/pull/7998)

1 · finding · CodeRabbit

### 24. Pagination applied to only one of several composed data sources

pagination-across-composed-queries

A handler builds a paginated result by combining an OpenSearch call with a subsequent DB fetch but applies offset/limit to only one of the two, so pages beyond the first return wrong results — flagged by the automated reviewer and merged 35 seconds later unaddressed.

Recommended fix When a result set is assembled from more than one query, apply offset/limit exactly once on the final ordered result, not on the intermediate calls; flag PRs that merge within seconds of an unaddressed automated review comment naming a concrete defect.

**[#7364](https://github.com/joinfleek/fleek-api/pull/7364)** — [#7380](https://github.com/joinfleek/fleek-api/pull/7380)

1 · finding · Pre-commit / CI

### 25. Migration references a table name that doesn't exist in the live schema

unverified-migration-table-name

A migration creates an index against a plural/misspelled table name that doesn't match the real singular table, flagged by the automated reviewer and merged anyway, requiring a same-week fix.

Recommended fix Add a CI check that parses new migration files for table references and verifies each exists in docs/db/schema.sql before merge, suggesting the closest match on mismatch.

**[#7361](https://github.com/joinfleek/fleek-api/pull/7361)** — [#7405](https://github.com/joinfleek/fleek-api/pull/7405)

1 · finding · Rule doc

### 26. New external-API integration shipped with no dry-run verification

unverified-external-api-integration

A new GitHub Actions workflow integrating with Slack (hardcoded bot IDs, assumed message shape, unchecked error handling) merged with no evidence of a live dry run, and every unverified assumption turned out wrong, requiring five follow-up PRs including a diagnostic-logging-only PR.

Recommended fix Require any new workflow calling an external API to include, in the test plan, evidence of an actual dispatched run against the real integration with a log excerpt proving the code path executed; never guess hardcoded external identifiers from memory.

[#7360](https://github.com/joinfleek/fleek-api/pull/7360)[#7401](https://github.com/joinfleek/fleek-api/pull/7401)[#7481](https://github.com/joinfleek/fleek-api/pull/7481)[#7485](https://github.com/joinfleek/fleek-api/pull/7485)[#7500](https://github.com/joinfleek/fleek-api/pull/7500)

1 · finding · CodeRabbit

### 27. CodeRabbit-flagged correctness risk merged unresolved, bug ships as predicted

unresolved-review-flag-on-gated-branch

An automated review comment named a specific reproducible correctness concern (a no-op response branch not reflecting real state); the PR merged with the concern neither fixed nor addressed, and the predicted bug shipped and needed a dedicated fix two weeks later.

Recommended fix Require that a PR not merge while a named, reproducible automated-review concern is left neither fixed nor explicitly dismissed in the thread; treat silent merge over a named risk the same as an unresolved human comment.

**[#8111](https://github.com/joinfleek/fleek-api/pull/8111)** — [#8361](https://github.com/joinfleek/fleek-api/pull/8361)

1 · finding · CodeRabbit

### 28. Inconsistent feature-flag gate response semantics across a multi-PR rollout

inconsistent-feature-flag-gate-semantics

A new branch gated behind the same feature flag as sibling branches in the same rollout used a different success/failure convention for the 'flag off' case than its siblings, flagged by the reviewer as a suspicious pattern and merged anyway.

Recommended fix Require flag-gated branches added within the same rollout to use one agreed response convention for the disabled path, documented in the first PR of the rollout, and resolve any 'diverges from sibling PR' review comment before merge.

**[#8114](https://github.com/joinfleek/fleek-api/pull/8114)** — [#8115](https://github.com/joinfleek/fleek-api/pull/8115)

1 · finding · CodeRabbit

### 29. LaunchDarkly context keyed differently across sibling call sites for the same flag

feature-flag-identity-key-drift

Changing the LD identity key used to evaluate one flag (email vs Shopify customer id) at one call site leaves a sibling flag/path for the same conceptual feature keyed differently, producing inconsistent flag results for the same user across code paths.

Recommended fix When a diff changes the identity key passed to an LD evaluation, search the repo for other flag evaluations in the same feature family and require they use the same identity key or an explicit stated reason for divergence.

**[#8116](https://github.com/joinfleek/fleek-api/pull/8116)** — [#8361](https://github.com/joinfleek/fleek-api/pull/8361)

1 · finding · CodeRabbit

### 30. IAM permission parity gap on Lambda-to-Fargate compute migration

iam-permission-parity-on-compute-migration

Cutting traffic from a Lambda to a Fargate task for the same route changed no IAM permissions, silently breaking every existing Job.run() call reachable from that route because the new task role lacked a grant the old Lambda execution role had.

Recommended fix Require any PR that routes traffic to a new compute resource for an existing route to enumerate every downstream AWS API call reachable from that code and diff it against the new role's IAM policy before merge.

**[#8929](https://github.com/joinfleek/fleek-api/pull/8929)** — [#8977](https://github.com/joinfleek/fleek-api/pull/8977)

1 · finding · Rule doc

### 31. Shared function extended to a new caller without auditing its existing invariant

shared-function-guard-invariant

A filter/join predicate was removed from a shared resolver method to fix one bug, without checking that other existing callers of the same method depended on the removed predicate for correctness — causing a 'ghost member' price-inflation bug elsewhere.

Recommended fix Before changing the filtering behavior of an existing shared method, grep the whole repo for every call site and confirm each caller's correctness assumption is still met; add a distinctly-named sibling method instead of silently changing shared behavior.

**[#7531](https://github.com/joinfleek/fleek-api/pull/7531)** — [#7934](https://github.com/joinfleek/fleek-api/pull/7934)

1 · finding · Rule doc

### 32. Non-idempotent automatic redrive of an async operation duplicates external side effects

non-idempotent-retry-redrive

A new reconciler cron automatically re-enqueues stuck in-flight operations through the full pipeline, but the pipeline's external-create step infers 'fresh create' from an id-shape check rather than a persisted completion marker, so every redrive of a still-stuck row mints a duplicate external resource.

Recommended fix Require any cron/reconciler that automatically redrives a stuck async operation to verify idempotency via a persisted marker of prior completion before repeating a non-idempotent external side-effecting call, not an inferred id-shape check.

**[#9304](https://github.com/joinfleek/fleek-api/pull/9304)** — [#9499](https://github.com/joinfleek/fleek-api/pull/9499)

1 · finding · Pre-commit / CI

### 33. Financial calculation logic shipped with no automated test coverage

missing-tests-for-financial-calculation-logic

New bundle-reprice pricing/shipping calculation logic shipped verified only by a manual dev-stage checklist; the follow-up fix had to add 19 unit tests to surface two calculation bugs unit tests would trivially have caught, including a stale-value-recomputed-from-current-state bug.

Recommended fix Require any PR modifying a money-deriving calculation function to include a corresponding test file change in the same PR; flag when a subtracted/divided component is recomputed from current state rather than the value stored when the total was originally computed.

**[#7150](https://github.com/joinfleek/fleek-api/pull/7150)** — [#7225](https://github.com/joinfleek/fleek-api/pull/7225)

1 · finding · CodeRabbit

### 34. Unbounded per-item compute (index rebuilt per iteration) in a batch validation loop

unbounded-per-item-compute-in-batch-loop

A bulk-product validator constructs a new Fuse.js fuzzy-search index per product inside a batch loop with no memoization and no cost bound, causing prod event-loop stalls once the service moved to a shared-event-loop runtime — the PR's own description named this as a deferred, unaddressed risk.

Recommended fix Flag expensive index/object construction found inside a loop over batch entities and require it be constructed once outside the loop and reused/memoized, with any deferred perf risk in a PR description requiring a linked tracked issue, not silent acceptance.

**[#8937](https://github.com/joinfleek/fleek-api/pull/8937)** — [#9516](https://github.com/joinfleek/fleek-api/pull/9516)

1 · finding · CodeRabbit

### 35. Multi-step DB-mutation shipped verified only by mocked unit tests, never staged

staging-verification-gap-on-stateful-mutations

A generation-tracked pricing mutation was backed only by mocked unit tests; every downstream bug (wrong row count, no re-pricing, blind diff on prior dead generation) was found only when someone actually ran the mutation against real staging/production data.

Recommended fix Require staging verification with real seeded data — not only mocked unit tests — before merging any PR touching generation-tracked/versioned state, with the PR's testing section showing pasted real output.

**[#9493](https://github.com/joinfleek/fleek-api/pull/9493)** — [#9543](https://github.com/joinfleek/fleek-api/pull/9543) · [#9549](https://github.com/joinfleek/fleek-api/pull/9549) · [#9605](https://github.com/joinfleek/fleek-api/pull/9605)

Lens 2 of 2

## Pure bug-fix findings

457 fix PRs with no feature PR behind them in this repo's own recent history — regressions, flaky infra, and long-standing bugs. 100% deep-read, clustered into 32 patterns below, ranked by frequency.

7 · findings · Pre-commit / CI

### 1. No CI gate for typecheck/lint/tests before merge

ci-gate-gap

Compile errors, syntax errors, and failing unit tests reach main because no CI workflow actually fails on them: the coverage workflow has continue-on-error true, the build-deploy workflow never runs typecheck, and the bundler (esbuild) doesn't typecheck at all — so a duplicate identifier, unbalanced paren, nonexistent method call, or six-of-seven-failing test file merges silently and often reaches production before anyone notices.

Recommended fix Add `yarn typecheck` (tsc --noEmit) and a non-continue-on-error unit test run as required, blocking status checks in pr-checks.yml / pr-coverage.yml, and mark them required in branch protection so a PR cannot merge with new compile errors or failing tests.

[#9135](https://github.com/joinfleek/fleek-api/pull/9135)[#9362](https://github.com/joinfleek/fleek-api/pull/9362)[#8994](https://github.com/joinfleek/fleek-api/pull/8994)[#6443](https://github.com/joinfleek/fleek-api/pull/6443)[#8825](https://github.com/joinfleek/fleek-api/pull/8825)[#9679](https://github.com/joinfleek/fleek-api/pull/9679)[#9193](https://github.com/joinfleek/fleek-api/pull/9193)

5 · findings · Rule doc

### 2. FleekTracer.error used for expected/business-level failures, polluting alert dashboards

error-log-severity-classification

Catch blocks default to FleekTracer.error for conditions that are actually expected (business-rule rejection, self-healing fallback, tolerated per-item cron failure), which pages/pollutes error dashboards and requires a reactive downgrade PR after an alert-fatigue incident, recurring across at least five separate subsystems.

Recommended fix Require that any catch block performing a known fallback/recovery action, or catching a business-validation error type, log at warn/info and/or register the pattern in lib/observability/errorClassifier.ts's EXPECTED_ERROR_PATTERNS in the same PR — never default to FleekTracer.error for a condition the code already knows how to handle.

[#6813](https://github.com/joinfleek/fleek-api/pull/6813)[#8736](https://github.com/joinfleek/fleek-api/pull/8736)[#9564](https://github.com/joinfleek/fleek-api/pull/9564)[#7700](https://github.com/joinfleek/fleek-api/pull/7700)[#6797](https://github.com/joinfleek/fleek-api/pull/6797)

5 · findings · Rule doc

### 3. Silent bail-out / early return with no logging on the failure branch

silent-failure-return

Functions signal failure via a bare `false`/`{}`/`undefined`/`return` on a guard clause with no structured log, so a production burst of failures produces an undiagnosable generic error and the root cause takes days to trace — recurring across rate-card healing, handpick shipping guards, product-approval error propagation, and broad catch-all suppression.

Recommended fix Require any early-return/guard-clause bail-out on a write or calculation path to log a structured reason (FleekTracer) naming the failing precondition, or return a discriminated result carrying a code/reason instead of a boolean/empty sentinel.

[#9693](https://github.com/joinfleek/fleek-api/pull/9693)[#9695](https://github.com/joinfleek/fleek-api/pull/9695)[#9647](https://github.com/joinfleek/fleek-api/pull/9647)[#8191](https://github.com/joinfleek/fleek-api/pull/8191)[#9698](https://github.com/joinfleek/fleek-api/pull/9698)

5 · findings · Rule doc

### 4. CDN URL rewrite missing or inconsistently applied to asset URLs

missing-cdn-url-mapping

Image/asset URL fields are returned to clients straight from raw S3/Shopify origin URLs instead of through CDNService.getCDNUrl(), recurring across order, vendor, product, and cart resolvers because there is no shared enforcement — each occurrence found and fixed independently.

Recommended fix Add a non-blocking PostToolUse hook flagging new code that assigns an image/imageUrl/thumbnail field from a raw `.url`/`asset.url` read without a nearby getCDNUrl() call, and document the requirement as an L1 rule.

[#6621](https://github.com/joinfleek/fleek-api/pull/6621)[#9150](https://github.com/joinfleek/fleek-api/pull/9150)[#9602](https://github.com/joinfleek/fleek-api/pull/9602)[#9137](https://github.com/joinfleek/fleek-api/pull/9137)[#9125](https://github.com/joinfleek/fleek-api/pull/9125)

4 · findings · Claude hook

### 5. Raw headers/credentials/context logged verbatim into FleekTracer or Slack

credential-logging

Full request-header objects, JWTs, or context blobs (which carry x-api-key/authorization tokens) are passed directly into FleekTracer or Slack-alert calls instead of an allow-listed, redacted subset — leaking credentials into logs and an external channel, fixed piecemeal at individual call sites while the same anti-pattern persists elsewhere in the codebase.

Recommended fix Add a grep-based PostToolUse hook flagging any FleekTracer/Slack call whose logged object contains a bare `headers`, `context`, or `token` key, nudging toward an explicit allow-listed field extraction (e.g. getHeaderMap) instead of passing the raw object.

[#6663](https://github.com/joinfleek/fleek-api/pull/6663)[#9697](https://github.com/joinfleek/fleek-api/pull/9697)[#8787](https://github.com/joinfleek/fleek-api/pull/8787)[#7388](https://github.com/joinfleek/fleek-api/pull/7388)[#7391](https://github.com/joinfleek/fleek-api/pull/7391)

4 · findings · Pre-commit / CI

### 6. Migration table/FK/index integrity gaps (wrong table name, missing index, missing PK)

migration-schema-integrity

Migrations reference a foreign-key table with the wrong name/type, add a column without indexing it despite being a hot filter/FK column, or leave a legacy table without a primary key — each discovered reactively via a production incident (seq-scan pool exhaustion, blocked CDC replication) rather than caught at migration-authoring time.

Recommended fix Extend scripts/model-validation/schemaDriftCheck.ts to validate FK target table names against docs/db/schema.sql, and add checks flagging new FK columns with no index and tables with no PRIMARY KEY constraint.

[#7758](https://github.com/joinfleek/fleek-api/pull/7758)[#9255](https://github.com/joinfleek/fleek-api/pull/9255)[#9783](https://github.com/joinfleek/fleek-api/pull/9783)[#8319](https://github.com/joinfleek/fleek-api/pull/8319)[#8313](https://github.com/joinfleek/fleek-api/pull/8313)

4 · findings · CodeRabbit

### 7. External API error catch logs only error.message, discarding response status/body

shallow-external-api-error-capture

Catch blocks around Agora/third-party API calls log only the generic exception message, discarding the response's status/body/error code, making every distinct failure indistinguishable — fixed for one code path (recording start) and then had to be fixed again for the sibling path (recording stop) and again for a separate shared HTTP tracker utility.

Recommended fix Flag any catch block wrapping an external HTTP/SDK call where only error.message is logged; require a shared error-descriptor helper that extracts response status, body, and endpoint, reused across every catch block around the same client.

**[#9401](https://github.com/joinfleek/fleek-api/pull/9401)** — [#9427](https://github.com/joinfleek/fleek-api/pull/9427) · [#9498](https://github.com/joinfleek/fleek-api/pull/9498) · [#9544](https://github.com/joinfleek/fleek-api/pull/9544)

4 · findings · Claude hook

### 8. Duplicated hand-rolled logic instead of reusing an existing helper/predicate

reuse-duplication

New code re-implements a check (Google Drive host detection, finite-positive-quantity filter, error-formatting logic) that already exists elsewhere in the same file or a file being imported from, sometimes producing a weaker or inconsistent version of the existing check.

Recommended fix Add a grep-based PostToolUse hook that flags a newly-added predicate/filter matching an existing predicate already defined in the same file or an imported file, nudging extraction into one shared helper.

[#9637](https://github.com/joinfleek/fleek-api/pull/9637)[#9242](https://github.com/joinfleek/fleek-api/pull/9242)[#9690](https://github.com/joinfleek/fleek-api/pull/9690)[#6653](https://github.com/joinfleek/fleek-api/pull/6653)[#7691](https://github.com/joinfleek/fleek-api/pull/7691)

3 · findings · Pre-commit / CI

### 9. Hardcoded lookup map drifts from real production data (typo, missing entry, duplicate key)

stringly-typed-lookup-drift

A hand-maintained Record/object-literal map keyed by category name, discount-code prefix, or product category silently drifts from real data — a typo (Sneakers vs Sneaker), a duplicate object key (two 'Blazer' entries silently overwriting each other), or an unmapped discount-code prefix leaving rows permanently null with no error, discovered only via production incident.

Recommended fix Add a duplicate-object-key static check (a standalone no-dupe-keys ESLint pass, since the flat config is broken and tsc's error count masks it) plus a drift check diffing hardcoded category/prefix maps against actual DB distinct values, and require unmatched lookups to log/alert rather than silently no-op.

**[#6646](https://github.com/joinfleek/fleek-api/pull/6646)** — [#9143](https://github.com/joinfleek/fleek-api/pull/9143) · [#9683](https://github.com/joinfleek/fleek-api/pull/9683)

3 · findings · Rule doc

### 10. Incomplete rollout to sibling code paths for the same entity

incomplete-parity-across-sibling-code-paths

A derived value or business rule is computed correctly in one endpoint (order detail) but computed differently (or not at all) in a sibling endpoint reading the same entity (order list, cart zone-price fetch), causing silent value drift between the two — the same class documented separately in the feature-fix list but recurring here as standalone bug fixes.

Recommended fix Extract the derivation into one shared helper called from every sibling endpoint reading the same entity; require a grep of every resolver/handler reading the entity before closing a fix that only touches one of them.

**[#9748](https://github.com/joinfleek/fleek-api/pull/9748)** — [#9069](https://github.com/joinfleek/fleek-api/pull/9069) · [#9357](https://github.com/joinfleek/fleek-api/pull/9357) · [#8558](https://github.com/joinfleek/fleek-api/pull/8558)

3 · findings · Pre-commit / CI

### 11. FleekStack hits CloudFormation's 500-resource-per-stack hard cap

infra-capacity-ceiling

FleekStack repeatedly grows to exactly CloudFormation's 500-resource ceiling, so any subsequent PR adding a route/queue/lambda breaks every production deploy until a reactive PR moves a resource to a satellite stack (FinanceStack/GrowthStack) or drops one entirely — happened three separate times.

Recommended fix Add a CI check that synthesizes/approximates FleekStack's CloudFormation resource count on any diff touching stacks/FleekStack.ts and fails/warns when within a safety margin of 500, directing new resources to a satellite stack with headroom.

**[#9500](https://github.com/joinfleek/fleek-api/pull/9500)** — [#9526](https://github.com/joinfleek/fleek-api/pull/9526) · [#9718](https://github.com/joinfleek/fleek-api/pull/9718)

3 · findings · Pre-commit / CI

### 12. SST resource binding drift on a shadow/canary Lambda or scattered .bind() calls

infra-resource-binding-drift

A canary/ALB Lambda serving the same resolvers as the main API Lambda has its own independently hand-maintained .bind() list that silently drifts from the main API's bindings, and cross-stack addEnvironment() calls silently no-op when target Function and referenced value live in different stacks — both surfacing only as a runtime 'not bound to this function' error.

Recommended fix Add a deterministic checker that statically maps every SST resource access reachable from each Lambda entry point's call graph against the .bind() calls in stacks/*.ts, failing when a reachable resource isn't matched by a binding; require addEnvironment() calls to live in the same stack file as the target Function.

**[#9086](https://github.com/joinfleek/fleek-api/pull/9086)** — [#9087](https://github.com/joinfleek/fleek-api/pull/9087) · [#9636](https://github.com/joinfleek/fleek-api/pull/9636) · [#8153](https://github.com/joinfleek/fleek-api/pull/8153)

3 · findings · Rule doc

### 13. Reactive rate-limit/IP-resolution tuning after production incidents

reactive-rate-limit-and-ip-resolution

Rate-limit thresholds are sized by guesswork and IP-based rate limiting keys on the wrong value (internal VPC-link hop, shared SSR IP) behind different network topologies, each discovered only after a production incident (429 storms, wrongly throttled users) and fixed with a new ad hoc patch each time.

Recommended fix Require rate-limit thresholds be named constants with a documented traffic-basis comment, and require all client-IP resolution route through one canonical resolveClientIp() helper — never re-read x-forwarded-for/forwarded headers inline at a new call site.

**[#9263](https://github.com/joinfleek/fleek-api/pull/9263)** — [#9220](https://github.com/joinfleek/fleek-api/pull/9220) · [#9223](https://github.com/joinfleek/fleek-api/pull/9223) · [#9222](https://github.com/joinfleek/fleek-api/pull/9222)

3 · findings · Pre-commit / CI

### 14. Bug-fix PR ships with no accompanying regression test

missing-regression-test

A one-line bug fix to a boolean condition, currency conversion, or description formatter ships with zero test-file changes, so the exact regression class has no automated guardrail against reintroduction.

Recommended fix Add a CI check flagging PRs whose commits match `fix(` and whose diff touches only non-test business-logic files with no corresponding *.test.ts change, requiring either a test or an explicit justification in the PR description.

**[#6458](https://github.com/joinfleek/fleek-api/pull/6458)** — [#7130](https://github.com/joinfleek/fleek-api/pull/7130) · [#9148](https://github.com/joinfleek/fleek-api/pull/9148)

3 · findings · Rule doc

### 15. Check-then-act race with no lock around external side-effect + DB persistence

concurrency-check-then-act-race

A handler reads a nullable 'already generated' field and, if absent, calls an external side-effecting create (Shopify discount, referral code) before writing the field back, with no lock serializing concurrent invocations — two simultaneous calls both mint external resources and the second DB write orphans the first; fixed by adding a per-entity lock and reordering DB-verification before the external call.

Recommended fix Require any check-then-generate-then-persist sequence involving an external, hard-to-reverse side effect to be wrapped in the codebase's established per-entity RedisLock idiom with a re-check after acquiring the lock, and to verify DB state before (not after) the external call.

**[#9413](https://github.com/joinfleek/fleek-api/pull/9413)** — [#9412](https://github.com/joinfleek/fleek-api/pull/9412) · [#9302](https://github.com/joinfleek/fleek-api/pull/9302)

2 · findings · Pre-commit / CI

### 16. Kysely pinned-version (0.23.5) API mismatch (pure bug-fix incidents)

dependency-compatibility

Code written against Kysely's callable expression-builder / grouped-OR syntax, which only exists in Kysely ≥0.27, type-checks but throws at runtime because the repo pins 0.23.5 — the same recurring class documented separately in the feature-fix list, showing up again as standalone bug fixes.

Recommended fix Add a deterministic grep-based pre-commit/CI check for callable-eb and grouped .where((eb) => ...) patterns across model/data files, failing with a pointer to the sql-template-literal replacement pattern.

**[#6712](https://github.com/joinfleek/fleek-api/pull/6712)** — [#8967](https://github.com/joinfleek/fleek-api/pull/8967)

2 · findings · Pre-commit / CI

### 17. FleekTracer imported from the wrong package (@joinfleek/fleek-agents instead of local lib/logger)

wrong-import-source

cartV2.ts and sibling handler files import FleekTracer from an unrelated external npm package with a compatible-enough API, so logs silently never reach SigNoz — the exact same file's import was fixed once, then broke again (or a sibling file broke) months later.

Recommended fix Add an ESLint no-restricted-imports rule banning FleekTracer imports from @joinfleek/fleek-agents anywhere in packages/functions/src and lib/, pointing to the canonical lib/logger/fleekTracer path.

**[#6801](https://github.com/joinfleek/fleek-api/pull/6801)** — [#9288](https://github.com/joinfleek/fleek-api/pull/9288)

2 · findings · Rule doc

### 18. CloudFormation cross-stack export-in-use deadlock when removing an SST resource

infra-cfn-export-removal

Deleting an SST/CDK resource (queue, topic) still imported cross-stack by another stack (CronStack, HandlerStack) causes CloudFormation to refuse the export deletion, deadlocking every deploy — requiring emergency pin/two-pass-deploy fixes and recurring for both a topic and a queue removal.

Recommended fix Require any removal of a cross-stack-referenced construct to first land a change removing all importers, verified via `aws cloudformation list-imports`, before a second deploy deletes the construct itself — never delete resource and last importer in the same change.

**[#8504](https://github.com/joinfleek/fleek-api/pull/8504)** — [#8527](https://github.com/joinfleek/fleek-api/pull/8527) · [#8528](https://github.com/joinfleek/fleek-api/pull/8528) · [#8529](https://github.com/joinfleek/fleek-api/pull/8529)

2 · findings · Rule doc

### 19. Shopify GraphQL connection pagination missing (first:N treated as complete)

unpaginated-external-api-connection

Shopify variant queries use a fixed `first:N` page with no hasNextPage/after pagination and are consumed as the complete result set, silently truncating variants for any product over the page size and causing 'variant already exists' errors or incomplete repricing.

Recommended fix Require any Shopify connection field consumed as a complete set to request pageInfo{hasNextPage,endCursor} and page through with after until exhausted; add a grep-based check flagging `(first: \d+)` connection fields with no sibling hasNextPage handling.

**[#8434](https://github.com/joinfleek/fleek-api/pull/8434)** — [#8443](https://github.com/joinfleek/fleek-api/pull/8443)

2 · findings · Pre-commit / CI

### 20. Shopify GraphQL userErrors/top-level errors not checked (HTTP 200 treated as success)

shopify-error-classification

A Shopify mutation call site never selects or checks the userErrors/top-level errors field, so a business-level rejection (storage cap, per-product write lock) returns inside an HTTP 200 and is silently swallowed or fails without retry.

Recommended fix Add a check flagging any Shopify GraphQL mutation call whose selection set omits userErrors, or whose response handling never inspects it; require the error-classification/retry check to happen inside the retry callback, not after it resolves.

**[#9219](https://github.com/joinfleek/fleek-api/pull/9219)** — [#9716](https://github.com/joinfleek/fleek-api/pull/9716)

2 · findings · Claude hook

### 21. External HTTP/SDK client created with no timeout, hangs the request path

missing-http-timeout

axios/Stripe clients are instantiated without an explicit timeout, so a degraded upstream (OpenSearch, Stripe) hangs the synchronous request path for tens of seconds, cascading into shared-runtime latency for unrelated requests — the same missing-timeout pattern still exists unfixed at other axios.create() call sites in the codebase.

Recommended fix Add a PostToolUse hook flagging any new axios.create({...}) block with no `timeout` key, and require every external SDK/HTTP client used on a synchronous request path to set a bounded timeout and limited retries.

**[#8745](https://github.com/joinfleek/fleek-api/pull/8745)** — [#9186](https://github.com/joinfleek/fleek-api/pull/9186) · [#9185](https://github.com/joinfleek/fleek-api/pull/9185)

2 · findings · Rule doc

### 22. Per-item external notification loop with no batching hits rate limit and retries duplicate everything

unbatched-external-call-in-loop

A cron sends one Slack message per matched item in a tight loop with no try/catch isolation; hitting Slack's per-channel rate limit throws, fails the whole Lambda, and the at-least-once scheduler retries and re-sends every already-posted alert — happened in two separate crons with the second PR explicitly citing the first as the same root cause.

Recommended fix Require any per-item external notification call inside a loop be isolated in its own try/catch (log-and-continue, never rethrow) and batched into a single digest/threaded message per run rather than one call per item.

**[#8343](https://github.com/joinfleek/fleek-api/pull/8343)** — [#8341](https://github.com/joinfleek/fleek-api/pull/8341)

2 · findings · Rule doc

### 23. Bulk UPDATE with no no-op guard causes massive unnecessary write/WAL churn

no-op-write-churn

A bulk CASE-based UPDATE model method writes every targeted row unconditionally instead of comparing the computed value against the stored value first, generating millions of no-op rewrites per day on hot tables, discovered only via manual production write-volume measurement — the identical fix was applied to two different tables months apart.

Recommended fix Require any bulk/batch UPDATE writing a computed value across many rows to include an `IS DISTINCT FROM` guard comparing computed vs. stored value before the write, and spot-check new bulk-write call sites against prod for no-op rewrite rate before merge.

**[#9437](https://github.com/joinfleek/fleek-api/pull/9437)** — [#9426](https://github.com/joinfleek/fleek-api/pull/9426) · [#9359](https://github.com/joinfleek/fleek-api/pull/9359)

2 · findings · Rule doc

### 24. Non-terminal status used as an unbounded lock with no staleness/TTL check

unbounded-status-lock

A status column's non-terminal value is used to gate another action ('is this still in progress') with no age check against a timestamp, so a crashed background job leaves a permanent lock — the identical fix (a 15-minute staleness window) had already been applied to a sibling gate in the same domain two weeks earlier.

Recommended fix Require any 'is X in progress' gate be paired with a timestamped last-transition column checked against a named staleness/TTL constant, so a crashed step can't lock the entity forever; check for an existing TTL pattern in the same domain before authoring a new unbounded one.

**[#9648](https://github.com/joinfleek/fleek-api/pull/9648)** — [#9361](https://github.com/joinfleek/fleek-api/pull/9361)

2 · findings · Rule doc

### 25. Job/cron OOMs from unbounded in-memory materialization or under-sized memory guesswork

unbounded-memory-materialization

A job fetches all rows into one long-lived array before doing any downstream work instead of streaming batches, or Lambda memory is bumped by guesswork after a single failed-invocation extrapolation rather than measured warm-container reuse, leading to repeated OOM incidents requiring another memory bump each time an upstream limit constant is raised.

Recommended fix Require cron/job data fetchers that paginate to also stream-process each batch incrementally rather than accumulating into one array, and require memory-size changes to cite an observed 'Max Memory Used' across at least two consecutive warm invocations, not a single cold-start extrapolation.

**[#9644](https://github.com/joinfleek/fleek-api/pull/9644)** — [#7727](https://github.com/joinfleek/fleek-api/pull/7727) · [#7748](https://github.com/joinfleek/fleek-api/pull/7748)

2 · findings · Pre-commit / CI

### 26. Terraform/CI secret declared but never wired into the deploy workflow's env

ci-secret-wiring-gap

A security-sensitive secret exists as a GitHub/Terraform-declared secret but was never mapped into the actual deploy workflow's env block or Terraform tfvars, so application code's silent-empty-string fallback shipped an effectively-forgeable or missing value to production undetected.

Recommended fix Add a CI check cross-referencing every secrets.<NAME> referenced in stacks/** or Terraform config against the env: blocks of every relevant deploy workflow, failing when a secret consumed by deploy-time code is missing from the wiring.

**[#9258](https://github.com/joinfleek/fleek-api/pull/9258)** — [#9391](https://github.com/joinfleek/fleek-api/pull/9391)

2 · findings · Claude hook

### 27. Git merge silently drops a needed commit or reintroduces removed code

merge-safety-gap

A PR is merged while a corrective commit is still mid-push to the same branch, or a `git merge main` pulls in a concurrently-merged sibling PR that removed an import this branch's new code still depends on — neither caught because no typecheck runs at merge time and CI's test job can be skipped.

Recommended fix Add a hook that runs before merge-adjacent git operations to fetch and compare the pushed branch's remote HEAD against what's about to be merged, and run a scoped typecheck immediately after any merge/rebase to catch now-dangling references before push.

**[#9797](https://github.com/joinfleek/fleek-api/pull/9797)** — [#9671](https://github.com/joinfleek/fleek-api/pull/9671)

2 · findings · Claude hook

### 28. Missing FleekTracer.initializeIdentifier() on Lambda/consumer/cron entry points

observability-gap

New or touched entry-point files call FleekTracer but never call initializeIdentifier(), so their SigNoz logs are unlabeled and can't be filtered/correlated by service — a widespread, recurring gap patched piecemeal file by file.

Recommended fix Add a PostToolUse hook flagging edited files under consumers/, crons/, or webhook/ that use FleekTracer without calling initializeIdentifier(), and extend the mandatory sqsConsumer() convention explicitly to crons and webhook handlers.

**[#8204](https://github.com/joinfleek/fleek-api/pull/8204)** — [#9541](https://github.com/joinfleek/fleek-api/pull/9541)

2 · findings · Pre-commit / CI

### 29. Duplicate/orphaned entries in the migration registry file (allMigrations.ts)

migration-registry-integrity

services/allMigrations.ts entries are silently dropped or merged into the wrong object literal (duplicate object keys overwrite each other, or an import exists with no matching array entry after a bad merge conflict resolution), and the existing registration-check script can't detect either case because it only substring-matches the whole file and only runs when a migration file is newly added.

Recommended fix Rewrite the migration registration checker to parse allMigrations.ts into explicit import-name and array-entry-name sets and fail on any mismatch in either direction, running on any PR touching the file, not only when a new migration file is added.

**[#9555](https://github.com/joinfleek/fleek-api/pull/9555)** — [#9824](https://github.com/joinfleek/fleek-api/pull/9824)

1 · finding · Pre-commit / CI

### 30. Out-of-band production DDL drift not caught by any harness

schema-drift-detection-gap

A production table gained a column and a widened unique index applied out-of-band with no repo migration, breaking an ON CONFLICT upsert target; the existing schema-drift harness has a --live mode built for exactly this but it never runs on a schedule against prod and doesn't diff indexes/constraints.

Recommended fix Extend the --live drift checker to diff indexes/unique/exclusion constraints (not just table/column existence) and wire it into a scheduled (daily) CI job that alerts on drift, rather than only running manually when someone happens to be editing that model file.

**[#9003](https://github.com/joinfleek/fleek-api/pull/9003)** — [#9004](https://github.com/joinfleek/fleek-api/pull/9004)

1 · finding · Rule doc

### 31. Unbounded synchronous CPU-bound loop over external/data-derived input blocks the event loop

unbounded-computational-complexity

An O(tokens²) n-gram expansion plus per-call reconstruction of fuzzy-search indexes ran synchronously on an unbounded-length, data-derived search term, blocking the shared Node event loop for 30.8 seconds in production.

Recommended fix Require any loop/expansion whose bound derives from external or data-sourced input length to have an explicit named cap constant, and memoize expensively-constructed static objects (search indexes, compiled regexes) instead of rebuilding them per call.

**[#9342](https://github.com/joinfleek/fleek-api/pull/9342)** — [#9341](https://github.com/joinfleek/fleek-api/pull/9341)

1 · finding · Rule doc

### 32. Premature/misordered rounding in money-per-unit-times-quantity arithmetic

premature-rounding-in-money-arithmetic

A guard-adding PR rounded a per-unit price to minor currency units before multiplying by quantity, reintroducing the exact sub-cent drift error the parent ticket was filed to eliminate — fixed the very next PR by moving the rounding to after the multiply.

Recommended fix Require that in any monetary calculation, rounding happen exactly once, at the end, after all multiplications/aggregations — never round an intermediate per-unit value before multiplying by a count or rate.

**[#9689](https://github.com/joinfleek/fleek-api/pull/9689)** — [#9692](https://github.com/joinfleek/fleek-api/pull/9692)

Closing the loop

## What to do with this

The 67 patterns above are already sorted into the four enforcement tiers this repo already uses (see `.claude/rules/` and `.coderabbit.yaml`) — so nothing here requires inventing new machinery, only writing new entries into machinery that already exists. The **25 rule-doc** patterns are the cheapest place to start: each is a paragraph in `CLAUDE.md` or a new file under `.claude/rules/`. The **18 pre-commit/CI** patterns take longer to write but, once shipped, can't be skipped by a rushed reviewer.

Before promoting any pattern into an actual rule or hook, cross-reference it against Wave 1 of this initiative (26 hand-picked, highest-comment PRs) — several patterns here (the Kysely version mismatch, missing-regression-tests-on-fix, CDN URL rewrite gaps) may already be partially covered by existing guidance, and the goal is to close real gaps, not duplicate a rule that already exists under a different name.

This wave covers `fleek-api` only. A matching pass over `fleek-monorepo` is the natural next step, run the same way — in-repo, full population, no sampling — so the two can be merged into one cross-repo view of what the harness is still missing.

AI-1b Wave 2 · generated 2026-08-22 · source data: `joinfleek/fleek-api`, 2026-02-22→2026-08-22 · read-only research artifact, nothing here was committed or opened as a PR.

## Version history

| v | published | by | bytes |
|---|---|---|---|
| 3 | 2026-08-26T07:00:42Z | Yugal Bagul | 142577 |
| 2 | 2026-08-26T06:53:42Z | Yugal Bagul | 13356 |
| 1 | 2026-08-26T06:36:33Z | Yugal Bagul | 12262 |
