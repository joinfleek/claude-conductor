# Post-Merge Fix Analysis — fleek-api, two PR arcs (13 commits)

## Read this first: the attribution result changes the case

All 13 commits were judged harness-addressable, but "harness-addressable" is not the same as "caused by the PR under investigation," and the difference is large enough that it should drive how these PRs are scoped.

**Only 4 of 13 are regressions actually introduced by the PRs we were investigating**, all from PR #9566 (`78eee4db7`): `789bcb5` (gdrive→S3 step dropped), `8000a86` (asset type inference), `11853af` (min-listing floor on a shared path), `4352d86` (metafield `id` key lost in the reroute). A fifth, `006996e`, is partial — #9566 introduced one of three wrong copies of the discount inverse, but the bug and two other copies date to 2025-04.

**PR #9748 introduced zero of the six commits in its arc.** Every one of `715a884`, `006996e`, `b98f8a9`, `0bfa99f`, `8b41383`, `a7e470e` carries an explicit non-attribution finding — `git blame` puts the defective lines at `cabc9f7334` (2025-03-05), `fb46be8f2` (2025-04-30), `f0f8c682dd` (2024-10-01), `075f0fa87`, `496be85c8f` (2025-09-29). The overlap with #9748 is file-level only. Three more in the #9566 arc are the same story: `a350cf6` (flip logic predates #9566 — confirmed at `78eee4db7^`), `4de7e9a` (#9566 never touched `updateProduct.ts`; the narrow guard came from #8937), `21fc0e2` (`fileSize: Int` traces to #4022 and #8272).

One commit, `0bfa99f`, is a regression from an **AI-assisted fix PR inside the arc** (#9796) rather than from either investigated PR.

So the honest split is: **5 defects introduced inside the review window** (4 from #9566, 1 from #9796), and **8 pre-existing latent defects** that a prod incident happened to surface during the same weeks. That matters mechanically, because a pre-merge diff gate cannot catch a defect written in 2024. Roughly half of the value in what follows comes from **repo-wide sweeps of existing code**, not from gating new PRs, and those sweeps will produce a violation backlog on day one. Budget for that.

---

## Pattern 1 — Migration parity: a new path replaces a legacy one and silently drops a side effect

**Evidence: 5 commits.** `a350cf6`, `789bcb5`, `4352d86`, `11853af`, `a7e470e`.

**Recurring root cause.** In each case a v2/replacement path reproduced the *visible* behaviour of the legacy path and dropped an *invisible* co-write, with nothing in the type system, schema, or tests coupling the two.

- `a350cf6`: the draft publish tail flipped `active → DRAFT` (with a `PUBLISH_STATUS_DECISION` metric and a decision log — the loud half) but never wrote the paired `product_approvals → HOLD` row. 652 stranded listings, 156 vendors over 30d. The legacy `updateProduct.ts` and `addAssetProduct.ts` each did both halves via a five-positional-argument call with inline literals (`'HOLD'`, `'system-hold@joinfleek.com'`) and no shared helper — there was no single callable unit to forget to call.
- `789bcb5`: #9566 rewrote bulk upload onto the draft/`productSet` pipeline and dropped `addAssetToProductViaExternalUrl`. The legacy call is still visibly present at `handler/product.ts:3566`. #9566 shipped 839 lines of new tests in `bulkAddProductV2.test.ts` and none entered the branch, because the fixtures carried no media URLs.
- `4352d86`: the legacy writer spread-merged onto the stored blob (`...metafieldValue, ...(id && { id })`); `buildDetailsMetafieldBlob` builds a closed allow-list from scratch, and `productSet` replaces wholesale, so the drop is destructive. 425 silently-failing Retool title edits over 30d.
- `11853af`: `validateMinListingValue` was copied from `validateMinListingValueForPublish` into the shared bulk validator **without the listing-type scoping predicate**. `ValidationContext` had no `listingType` field, even though `gradingProduct.ts:905` was already passing `listingType: ProductListingType.PIECE`. 4,271 grading products rejected in 48h; outage window opens one minute after #9566 merged.
- `a7e470e`: `reconcileDraftProduct` is a newer status writer that postdates the audit ERD's call-site inventory, so it was never wired to `ProductAuditLogModel.recordStateChanges` — and `auditContext` was declared optional, so omission compiled clean.

**Proposed harness change.** Two pieces, one PR.

1. **A `migration-parity` skill** at `skills/migration-parity/SKILL.md` in this repo, dispatched from the plan/ERD stage. Trigger heuristics: PR title or plan text matching `V2|v2|migrate|supersede|reroute`, or a diff where the old function survives in the same file while a new caller is pointed elsewhere. The skill's required output, blocking, is a **side-effect table** produced by grepping the legacy path for DB writes, external API calls, queue publishes and metafield/JSON-blob key sets — every row marked `ported` / `deliberately dropped + why` / `N/A`. For `789bcb5` that table's row is `addAssetToProductViaExternalUrl`; for `4352d86` it is the key-level diff `{id, details, inventory, shipping, assets}` vs `{details, shippingCalculatorUsed, inventory, shipping, assets}`; for `11853af` it is the guard conditions of the gate being copied.
2. **A CI required check in fleek-api** (`.github/workflows/migration-parity.yml`) that fails when the migration heuristic fires and the PR body has no `## Side-effect parity` section. Plus a narrow static rule with real teeth, worth landing on its own: an allowlist check that any file containing `updateTable('product').set({... status ...})` must also reference `ProductAuditLogModel.recordStateChanges` — exactly the gap that let `reconcileDraftProduct` ship uninstrumented (`a7e470e`). Generalize the `@ts-expect-error` regression test that commit added by hand: cross-cutting params (audit context, correlation id, actor) must not be optional on model methods.

**Effort / risk.** Medium — 1–2 weeks. The static audit-writer check is a day. Main risk is that checklist gates get rubber-stamped, and that the migration heuristic false-positives on ordinary refactors; keep the CI half warning-only for the first month and measure fire rate.

**Would plausibly have prevented:** 3 at PR time (`789bcb5`, `4352d86`, `11853af` — all #9566, all cases where the legacy path was still sitting in the same file). 2 more (`a350cf6`, `a7e470e`) are findable by the same audit run as a one-off sweep, not by a diff gate.

---

## Pattern 2 — A domain rule with no single owner, copy-pasted until the copies diverge

**Evidence: 4 primary commits** (`006996e`, `21fc0e2`, `8000a86`, `715a884`) **plus 2 secondary** (`a350cf6`, `0bfa99f`).

**Recurring root cause.** A rule that should live in exactly one named helper instead exists as N open-coded copies or N parallel declarations, and the copies drift. The failure is never a null check — it is arithmetic, a scalar width, or a default that looks plausible in review.

- `006996e`: `applyDiscount` was centralized; its inverse never was. **Four open-coded reversals, three of them wrong the same way** (`price + price*d/100` instead of `price / (1 - d/100)`). The forms coincide at `d=0` and diverge as `d` grows, so it manifests as multi-cycle ratcheting — £15 jackets showing as £1 (prod product 9345274609902). No round-trip test existed; the one the fix added is 38 lines.
- `21fc0e2`: `fileSize` declared `Int` in **three parallel places** (`ProductAssetInput`, `ProductAsset`, `UploadParamsInput`). 32-bit ceiling, so >2.1GB assets were refused at the gateway before any resolver ran. Fixing only the input would have moved the failure from write to read.
- `8000a86`: `getImageTypeFromUrl` fails open in the wrong direction — `return hasImageExtension ? 'image/*' : 'video/*'`, no unknown branch. #9566's `buildAssets` set `type: 'video'` explicitly for `videoSrc` and omitted the symmetric tag for `imageSrc`/`otherImages` in the same block.
- `715a884`: **four sites** assigned a freshly-computed subset over the stored `shipping.multiVariantRates` map. The ticket named only two; the author found the other two by hand. Key types were never normalised either — a numeric `50` and `"50"` could coexist while the read path does `multiVariantRates[String(quantity)]`.
- Secondary: `a350cf6`'s duplicated hold literals across two files; `0bfa99f`'s three copies of the backfill predicate, of which only the IT job's hand-rolled version had the `IS NULL` clauses.

**Proposed harness change.** A **forbidden-pattern registry** — one PR, one mechanism, seeded with patterns that are all directly evidenced above. Ship it from this repo as `engine/pattern-guards/` plus a generated pre-commit hook and a CI job in the consuming repo; the registry itself is a YAML file of `ast-grep` patterns (with regex fallback) that repo owners extend:

| Pattern | Message | From |
|---|---|---|
| `* discountValue) / 100`, `* discount_value) / 100` | use `applyDiscount`/`undoDiscount` from `data/products/helper.ts` | `006996e` |
| direct assignment to `*.multiVariantRates`, `*.multiVariantCalculatorRates` | use `mergeMultiVariantRates` | `715a884` |
| `Int` on `*Size`/`*Bytes`/`*Millis`/`*Timestamp` in `graphql/schema/*.graphql`; same field name declared with two scalars in one file | use `Float` + justifying comment | `21fc0e2` |
| object pushed into an assets array with no `type` key; sibling asymmetry where one push in a block sets `type` and another does not | tag explicitly, don't rely on `getImageTypeFromUrl` | `8000a86` |
| `someUrl.includes(<bucket/host constant>)` | use `new URL(x).hostname` against the `OriginBaseUrl`/`CDNBaseUrl` registry | `8b41383` |
| `'HOLD'` / `@joinfleek.com` literals passed positionally outside the data layer | route through a named helper | `a350cf6` |
| `->>` compared to a string literal without `coalesce`/`IS NULL`; commented-out `.orWhere(...)` in a query builder | NULL-safe predicate required | `0bfa99f` |

Pair with a **test-requirement rule** in the review skill: any helper introduced as the inverse of another (apply/undo, encode/decode, to/from) needs a round-trip property test plus a repeat-application test; any field mapped from an unbounded TS `number` into a GraphQL scalar needs a boundary test at the scalar's limit.

**Effort / risk.** Low–medium, and the best value-per-hour of the four. The runner is trivial; curating patterns is the work. Purely additive, trivially suppressible, near-zero false-positive risk because every pattern is a literal string. It is also the only pattern here that keeps paying as the registry grows.

**Would plausibly have prevented:** 2 at PR time (`8000a86`, and #9566's copy of the discount inverse in `handler/product.ts`). 3 more (`715a884`, `21fc0e2`, plus the second half of `006996e`) surface immediately on a first repo-wide run — all four `multiVariantRates` sites and all three `fileSize: Int` declarations are single-grep findable today.

---

## Pattern 3 — Errors swallowed, or a fabricated success value written to durable storage

**Evidence: 4 commits.** `4de7e9a`, `b98f8a9`, `8b41383`, `0bfa99f`.

**Recurring root cause.** A `catch` (or a falsy-coalescing assignment) manufactures a value that is structurally indistinguishable from success, then execution continues and that value gets persisted.

- `4de7e9a`: Shopify answers GraphQL throttling with HTTP 200 + top-level `errors` + no `data`, so the read "succeeded" with no product; `metafieldValue = product?.metafield?.value && (...)` yielded `undefined` over the `{}` initialiser; the `catch` logged `'Error Updating Product Details'` and fell through; the abort guard was scoped `if (partialUpdate && id && !product)`; and `handler/product.ts` discarded `updateProductHandler`'s return value entirely. Four compounding defects, every one of them a "keep going" decision.
- `b98f8a9`: all **12** locale converters did `.catch((error) => { return handle; })` — returning the function's own parameter. A stored English fallback is byte-identical in shape to a real translation, so the skip-if-present gate treated the locale as done and the product was never retried. Silent permanent corruption.
- `0bfa99f`: #9796's own RCA named silence as half the defect, then replaced `.catch(() => content)` with `.catch(() => undefined)` at all 12 sites — still zero log output. This is the one defect in the whole set an AI-assisted PR demonstrably introduced, and it is internally inconsistent with the PR's own written diagnosis.
- `8b41383`: `catch (error) { FleekTracer.error({...}); }` with no rethrow, returning a partial asset array as a success. ~190 listings/week published without the seller's primary photo; the log line omitted `vendor`, so `user.id` was null on 60/60 rows and the affected seller could not be identified.

**Proposed harness change.** An **ESLint rule pack**, shipped as a shared config the conductor plugin installs and a rule doc in `docs/`:

- `no-catch-returning-own-parameter` — flags `.catch(() => handle)` where `handle` is an enclosing parameter. Fires on all 12 sites in `b98f8a9`.
- `no-silent-value-catch` — a `.catch()` or catch block that returns a value without calling `FleekTracer`/logger. Fires on `0bfa99f`'s 12 sites and `8b41383`.
- `no-swallow-and-continue` — catch body containing only log calls, in a function that then reads a variable assigned inside the corresponding `try`, or that returns an aggregate result. Requires an explicit `// eslint-disable-next-line intentional-swallow: <reason>`. Fires on `4de7e9a` and `8b41383`.
- `no-floating-result` — discarding the return value of a function whose type carries an error/failure field. Fires on `4de7e9a`'s two `await updateProductHandler({...})` call sites.
- Plus a review-skill rule with no lint form: *a value produced by an error handler must never be written to durable storage as if it succeeded — degrade at the read layer and leave the field absent so it can be retried*; and *any idempotency/skip gate must key on "is the derived value present", not only on "did the source change"* (the `!existingTitle || hasFieldsChanged(...)` correction).
- One-line addition to the review skill worth its weight: *if a PR description names silent failure as part of the diagnosis, the diff must add a log line.* That single sentence is the whole of `0bfa99f` item (1).

**Effort / risk.** Medium. The rules are individually small; the cost is adoption. Repo-wide enablement will light up a large existing backlog (12 sites in one file alone), so land at `warn` with a baseline/suppression file and ratchet. Risk of noise is real — `no-swallow-and-continue` in particular needs tuning before it goes to `error`.

**Would plausibly have prevented:** 1 at PR time (`0bfa99f` item 1 — the one genuinely new defect). The other 3 date to 2024-10, 2025-03 and 2025-09 and are sweep-findable only. This pattern has the widest blast radius in production impact and the *narrowest* pre-merge prevention claim; do not let the first number get quoted as the second.

---

## Pattern 4 (hypothesis, n=2 — not a finding) — Session and merge integrity around AI-assisted PRs

**Evidence: 2 commits, one instance each.** `0bfa99f`, `21fc0e2`.

Two unrelated process failures, each seen exactly once. `0bfa99f` exists as a separate PR **only** because CodeRabbit's round-1 revision (`413efca`) was pushed 98 seconds after #9796 merged — the merged SHA was not the reviewed SHA, and an entire review round never reached `main`. Separately, `21fc0e2`'s PR body states: *"Not executed locally — no JavaScript runtime is reachable from this agent session (node/yarn are not on PATH)… This is the fourth consecutive fix-loop run in that state."* An agent shipped brand-new test files it could never execute, four sessions running.

**Proposed harness change.** Both are cheap and mechanical: (a) a required GitHub check in fleek-api blocking merge unless PR head SHA equals the last-approved SHA, plus an alert when a commit lands on a branch after its merge timestamp; (b) a preflight in this repo — extend `hooks/conductor-doctor.mjs` — that hard-fails loudly at session start when the project's declared test runner is not executable, rather than letting an agent write untestable tests for four consecutive runs.

**Effort / risk.** Low for both, hours not days. Risk is process friction on (a) for legitimate post-approval nit commits.

**Would plausibly have prevented:** 1 (`0bfa99f` would not have needed to exist). The (b) half prevents nothing in this dataset but is the highest-signal *harness* defect in it, and is directly in scope for the Local Assessment Engine.

**Label this a hypothesis, not a finding.** Two commits, two different mechanisms, one occurrence each. Ship (b) because it is nearly free and it is our own tooling; treat (a) as a proposal to put to the fleek-api owners, not a conclusion.

---

## Do the two arcs show the same patterns? No.

They show **different** patterns, and the difference is the most useful result in this analysis.

**Arc 1 (PR #9566, bulk-upload v2 migration — 7 commits)** is dominated by migration parity. Four of its seven commits are genuine #9566 regressions, and all four are the same shape: the v2 path reproduced the loud half of a legacy behaviour and dropped the quiet half (`789bcb5` asset hosting, `4352d86` metafield key, `11853af` scoping predicate, `8000a86` explicit type tag). The other three (`a350cf6`, `4de7e9a`, `21fc0e2`) are pre-existing defects that share files with #9566 by coincidence. This arc is genuinely gate-addressable: the legacy code was still sitting in the same file, unmodified, at review time.

**Arc 2 (PR #9748 — 6 commits)** contains **no #9748 regressions at all**. It is accumulated debt: error-swallowing from 2024–2025 (`b98f8a9`, `8b41383`), a replace-not-merge write from 2025-03 (`715a884`), an inverse formula from 2025-04 (`006996e`), an audit chokepoint never wired (`a7e470e`), plus one self-inflicted fix-PR regression (`0bfa99f`). Arc 2 is addressable almost entirely by **repo-wide sweeps**, not by a pre-merge gate. Presenting arc 2 as evidence that PR #9748 needed rework would be wrong, and it will be caught in review if we do.

Practically: the migration-parity work (Pattern 1) is justified by arc 1 alone. The lint packs (Patterns 2 and 3) are justified by arc 2, but their value proposition is "run once over the existing codebase and fix the backlog," with a smaller ongoing gate benefit.

---

## What the data is too thin to conclude

- **No denominator.** 13 fix commits over an unknown number of merged PRs, with no control group of PRs that needed no fixing. We cannot claim these patterns are elevated relative to the repo's baseline, only that they recur within this sample.
- **No AI-vs-human signal.** Exactly one defect (`0bfa99f` item 1) is demonstrably introduced by an AI-assisted PR, plus one process observation (`21fc0e2`'s unrunnable tests). n=2 is not enough to say anything about AI-authored code quality, and this report should not be cited as if it does.
- **False-positive rates are unmeasured.** None of the proposed lint rules has been run against fleek-api. Before committing to Pattern 3's rules in particular, dry-run them and report hit counts — 12 sites in one file suggests the backlog could be large enough to change the rollout plan.
- **`21fc0e2` is arguably not rework at all.** The `Int` declaration was correct for two years; it broke because vendors started uploading multi-GB video. That is a product-reality change surfacing a latent boundary, not a defect introduced by anyone in this window. The proposed schema lint is still worth having, but counting it as "rework caused by a PR" would inflate the case.
- **Merge-race frequency is unknown.** One occurrence, measured at 98 seconds. Whether this is chronic or a one-off needs a query over PR merge timestamps vs. subsequent branch pushes before anyone builds the gate.

## Suggested build order

Different from the evidence ranking, because effort and blast radius differ: **Pattern 2's registry first** (lowest effort, immediate sweep value, fires on 5+ commits' worth of existing code), then **Pattern 1's parity skill + audit-writer check** (highest genuine prevention value on new work), then **Pattern 3's lint pack** (biggest production impact, but needs a dry-run and a ratchet plan), with **Pattern 4(b)**'s runtime preflight landed opportunistically since it is a few hours of work in `hooks/conductor-doctor.mjs`.