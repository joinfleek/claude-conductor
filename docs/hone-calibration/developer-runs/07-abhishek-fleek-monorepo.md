# Run 7 — Abhishek Jaiswal · fleek-monorepo · 2026-08-24

**Largest corpus in the exercise (145 sessions), and the most damaged run.** Post-cutoff — he was
sent the four-check prompt at 15:52 IST, half an hour after `b6835d8`, with an explicit
`git pull origin feat/hone` instruction — and reported at 16:23.

Two of the four checks were compromised, in ways that are themselves the most valuable output of
this run.

## What completed

| Check | Status |
|---|---|
| 1 — Tier 1 heuristics (30d) | ✅ complete |
| 2 — Feature arcs (45d) | ⚠️ ran, but **numbers unusable** |
| 3 — Tier 2 comparison (14d) | ❌ hit the time cap, **no report written at all** |
| 4 — Tier 1 recall audit (14d) | ✅ complete, ~1 min |

## Check 1 — 145 sessions → 114 candidates (79%)

A=6 · B=67 · C=92 · D=69 · **E=44 · F=17 · G=6**

E's top hits, and this is the point:

| File | Edits |
|---|---|
| `product_view_duplicate_listing_erd_v1.md` | **42×** |
| `plan_media_upload_observability_v2.md` | **34×** |
| `plan_media_upload_observability_v3.md` | 21× |
| `useProductViewActions.ts` | 17× |
| PRD | 16× |
| *code files generally* | 4–10× |

**E's top five are four planning documents and one hook.** [README §9](../README.md) suspected
this from Yugal's two-session corpus (14× and 26× on tracker docs). Forty-four rows confirm it
decisively: on this corpus E is substantially a *documentation-churn* detector, and iterating a
plan doc 42 times is normal authoring behaviour, not thrash.

His proposed fix is the right one and is now the recommended form of README §11 item 3:
**E needs a docs/plans carve-out**, not just a higher threshold. A single global threshold cannot
separate "ERD edited 42×" (fine) from "`product.ts` edited 63×" (fleek-api, possibly also fine)
from genuine rework, because the innocent explanations differ by *file kind*, not by count.

## Check 2 — the silent false negative

**`gh` auth was 401 on his machine** (both `GH_TOKEN` and the keyring token invalid), so PR and
merge detection never ran. All 5 arcs reported `inactive-no-pr` — including SUP-411, which he
knows merged that week and which he noted was *"invisible to this run."*

**This is a worse bug class than anything in README §8.** Lenvin's repo-identity bug would have
thrown loudly at the approval step. The three arc-builder attribution bugs produced wrong numbers
but numbers that looked wrong on inspection. This one produces a **clean, plausible, entirely
false answer** — "no PRs on any of your branches" — and gives the reader no signal that a
prerequisite failed.

Any arc-builder run without verified `gh` auth is currently indistinguishable from a good one.
**Fix: check `gh auth status` at startup and refuse to run, rather than degrade silently.**

Second, unresolved oddity: **3 of 5 arcs show 0 commits despite 46–314 attributed edits.** That
smells like an edit→branch attribution bug distinct from the three already fixed. Not diagnosed.

Biggest arc `feat/detailed/duplicate`: 6.0 days, 24 sessions, 163 human turns, 314 edits / 68
files — the largest single arc measured anywhere in the exercise.

## Check 3 — lost entirely, and why that matters

The 14-day run blew the ~20-minute cap and was stopped. Because `tier2-compare.mjs` wrote its
report **only at the very end**, stopping it destroyed 100% of the work, not just the unfinished
remainder.

Aarushi's [run 4](04-aarushi-fleek-api.md) found that Tier 2 is too slow at volume. This run found
the reason that slowness is *unrecoverable*. **Fixed 2026-08-26** — the report is now created
before the loop and flushed after every session, so Ctrl-C keeps everything completed so far.

He substituted an earlier partial 30-day run (33 sessions, also stopped): **haiku 15 · sonnet 8 ·
opus 12**. Of sonnet's 8, **7 restate the delegation complaint** and 6 collapse to a single rule
candidate — roughly one distinct issue from eight findings, the worst distinct-yield recorded.

That partial run predates `b6835d8`, so it is a **pre-fix** data point and belongs with runs 2 and
3, not with 5 and 6. It is further confirmation of §4 rather than a contradiction of §10.

## Check 4 — a friction category nobody else found

10 non-candidates checked, 8 clean, **2 possible misses, both the same root cause**:

> `"husky - pre-push script failed (code 1) push to SUP-297"` — session `5a431eed`
>
> `"husky - pre-push script failed (code 1)"` + `"error: failed to push some refs to
> 'github.com:joinfleek/fleek-monorepo.git' push to SUP-79"` — session `ff93176a`

A pre-push hook rejecting a branch whose name lacked a Linear ticket ID, forcing a rename.

This is a **gate-rejection / tool-failure** class. Yash's audit found capability probing
(*"what do you need to open"*); Aarushi's found cross-session retry and stalled execution. This is
a third, distinct kind, and unlike those two it is fully reproducible.

**His conceptual point is the more important half, and it is new to this exercise:**

> separate **"harness caused rework"** from **"policy gate fired as designed."**

Both of his misses are the Linear-ticket gate working correctly. A developer hitting a guardrail
that exists on purpose is not harness friction — but Hone currently has no way to tell the two
apart, and a recall audit that widens `CORRECTION_PATTERNS` to catch this phrasing would start
manufacturing findings out of gates doing their job. **This is a prerequisite for README §11 item
7, not a subordinate detail of it.**

## Status

Never acknowledged. Reported 24 Aug, first read 26 Aug. Tier 2 re-run requested 26 Aug, after the
incremental-write fix.

## What cannot be known from this run

**No raw report file exists anywhere.** His Slack session had no file-upload capability, so
everything above beyond the aggregate numbers is his paraphrase rather than primary evidence. In
particular, the absence of the contaminated-prompt pattern in his completed checks is *inferred
from timing*, not verified against raw finding text.

⚠️ `hone-tier2-compare-fleek-monorepo-2026-08-24T11-22-06.md` in `~/Downloads` matches this repo
and date but is **Yash's** file, not his — see [run 5](05-yash-fleek-monorepo-rerun.md). The
referenced `...T10-03-25.md` partial does not exist on any machine we can reach.
