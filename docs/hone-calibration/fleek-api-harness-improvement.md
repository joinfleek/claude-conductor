# Fleek-api harness improvement

**Owner:** Yugal Bagul · **Date:** 2026-08-26 · **Status:** PRs open, awaiting review

An evidence-based look at what actually needed fixing after AI-assisted PRs merged in
`fleek-api`, and three combined harness changes proposed in response.

---

## What this is, and what it isn't

This came out of **AI-1 / Hone** — a local tool that reads a developer's own Claude Code session
history to find where AI-assisted work goes sideways. Four engineers ran calibration passes over
two weeks (Yugal, Lenvin, Yash on `fleek-monorepo`; Aarushi on `fleek-api`).

**A necessary caveat up front.** The check that produces Hone's actual *findings* never completed
on `fleek-api` — it was still running after ~1 hour at 104 sessions × 3 models and no follow-up
arrived. So **there are no Hone findings for this repo.**

Rather than port findings from `fleek-monorepo` into a repo where they were never observed, this
analysis is grounded in something harder: **13 real post-merge fix commits** from two merged
`fleek-api` PRs, each diff read individually.

That's a different, more conservative evidence base than "the AI tool said so."

---

## The headline number was wrong, and by a lot

Hone's arc builder reported **17 post-merge rework commits** on PR #9566 and **5** on #9748.
Reading the actual diffs changes that materially:

| | Count |
|---|---|
| Commits analysed | 13 |
| **Actually introduced by the PR under investigation** | **5** |
| Pre-existing latent defects, file-level overlap only | **8** |

**PR #9748 introduced zero of the six commits attributed to it.** `git blame` puts those
defective lines at commits from 2024-10, 2025-03, 2025-04 and 2025-09. A production incident
happened to surface them during the same weeks; the overlap is file-level coincidence.

This matters mechanically: **a pre-merge gate cannot catch a defect written in 2024.** Roughly
half the value below comes from *repo-wide sweeps of existing code*, not from gating new PRs —
and those sweeps will produce a violation backlog on day one. Budget for that.

**It also means Hone's rework metric needs line-level attribution (`git blame`), not file-level
overlap.** That's now a known defect in the tool, not a finding about the repo.

---

## The three patterns

### 1. Migration parity — a new path replaces a legacy one and drops a side effect
**Evidence: 5 commits.** `a350cf6`, `789bcb5`, `4352d86`, `11853af`, `a7e470e`

A v2 path reproduces the *visible* behaviour of the legacy path and drops an *invisible*
co-write. Nothing in types, schema or tests couples the two.

- **`a350cf6`** — the draft publish tail flipped `active → DRAFT` (with a metric and a decision
  log, the loud half) but never wrote the paired `product_approvals → HOLD` row. The ops review
  queue filters on that table, so edited listings went offline still tagged `APPROVED` and never
  appeared in Pending Review. **652 stranded listings, 156 vendors over 30 days.**
- **`4352d86`** — the legacy writer spread-merged onto the stored blob; the new builder builds a
  closed allow-list from scratch and `productSet` replaces wholesale, so the product `id` key was
  destroyed. **425 silently-failing Retool title edits over 30 days.**
- **`11853af`** — a validator was copied into a shared bulk path **without its listing-type
  scoping predicate**. **4,271 grading products rejected in 48h**; the outage window opens one
  minute after #9566 merged.
- **`789bcb5`** — bulk upload was rewritten onto the draft pipeline and dropped
  `addAssetToProductViaExternalUrl`. #9566 shipped **839 lines of new tests and none entered the
  branch**, because the fixtures carried no media URLs.

### 2. A domain rule with no owner, copy-pasted until the copies diverge
**Evidence: 4 primary + 2 secondary.** `006996e`, `21fc0e2`, `8000a86`, `715a884`

The failure is never a null check — it's arithmetic, a scalar width, or a default that looks
plausible in review.

- **`006996e`** — `applyDiscount` was centralised; its inverse never was. **Four open-coded
  reversals, three wrong the same way** (`price + price*d/100` instead of `price / (1 - d/100)`).
  The forms coincide at `d=0` and diverge as `d` grows, so it manifests as multi-cycle
  ratcheting — **a £15 jacket displaying as £1.**
- **`715a884`** — **four sites** assigned a freshly-computed subset over the stored
  `multiVariantRates` map instead of merging. The ticket named only two; the author found the
  other two by hand.
- **`21fc0e2`** — `fileSize` declared `Int` in **three parallel places**. 32-bit ceiling, so
  >2.1GB assets were refused at the gateway before any resolver ran.

### 3. Errors swallowed, or a fabricated success value written to durable storage
**Evidence: 4 commits.** `4de7e9a`, `b98f8a9`, `8b41383`, `0bfa99f`

- **`b98f8a9`** — all **twelve** locale converters did `.catch((error) => { return handle; })`,
  returning the function's own parameter. A stored English fallback is byte-identical in shape to
  a real translation, so the skip-if-present gate treated the locale as done. **Silent permanent
  corruption.**
- **`8b41383`** — `catch { FleekTracer.error(...) }` with no rethrow, returning a partial asset
  array as success. **~190 listings/week published without the seller's primary photo**, and the
  log line omitted `vendor`, so the affected seller couldn't be identified.
- **`0bfa99f`** — the follow-up fix replaced `.catch(() => content)` with
  `.catch(() => undefined)` at all 12 sites — **still zero log output**, despite the PR's own
  written diagnosis naming silence as half the defect. This is the one defect in the set
  demonstrably introduced by an AI-assisted PR.

### Not a finding — a hypothesis (n=2)
`0bfa99f` exists as a separate PR **only** because a review revision was pushed **98 seconds
after #9796 merged** — the merged SHA was not the reviewed SHA. Separately, `21fc0e2`'s PR body
states the agent had *"no JavaScript runtime reachable… the fourth consecutive fix-loop run in
that state"* — it shipped new test files it could never execute. Two mechanisms, one occurrence
each. Worth watching, not worth building on yet.

---

## The two arcs show *different* patterns — and that's the most useful result

**Arc 1 (#9566, bulk-upload v2 migration)** is dominated by migration parity. Four of its seven
commits are genuine regressions, all the same shape. **This arc is genuinely gate-addressable** —
the legacy code was still sitting in the same file, unmodified, at review time.

**Arc 2 (#9748)** contains **no regressions from that PR at all**. It's accumulated debt from
2024–2025. **Addressable almost entirely by repo-wide sweeps, not a pre-merge gate.** Presenting
arc 2 as evidence that #9748 needed rework would be wrong.

---

## Proposed changes — 3 PRs

Combined deliberately, rather than one PR per finding. All ship **warning-level and
non-blocking**, so adoption can be gradual.

| PR | Pattern | Mechanism | Prevents at PR time | Findable by sweep |
|---|---|---|---|---|
| **A** | 2 | Forbidden-pattern registry + advisory pre-commit step | 2 | 3 |
| **B** | 1 | `migration-parity` skill + audit-writer static check | 3 | 2 |
| **C** | 3 | Error-handling ESLint pack (warn → baseline → ratchet) | 1 | 3 |

**Build order is deliberately different from evidence ranking:** A first (lowest effort,
immediate sweep value), then B (highest genuine prevention value on new work), then C (biggest
production impact but needs a dry-run and a ratchet plan — a large existing backlog is expected).

---

## What this data cannot support

Stated plainly, because these numbers will get quoted:

- **No denominator.** 13 fix commits over an unknown number of merged PRs, with no control group.
  We cannot claim these patterns are elevated relative to baseline — only that they recur here.
- **No AI-vs-human signal.** Exactly **one** defect is demonstrably from an AI-assisted PR, plus
  one process observation. **n=2 says nothing about AI-authored code quality**, and this document
  should not be cited as if it does.
- **False-positive rates are unmeasured** for the proposed lint rules until the PRs' dry-run
  numbers land.
- **`21fc0e2` is arguably not rework at all** — `Int` was correct for two years and broke because
  vendors started uploading multi-GB video. Product reality changed; nobody introduced a defect.
- **Pattern 3 has the widest production impact and the narrowest pre-merge prevention claim.**
  Do not let the first number get quoted as the second.
