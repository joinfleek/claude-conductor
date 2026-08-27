# Run 4 — Aarushi · fleek-api · 2026-08-24

**The only backend run**, and the only one on the **fixed engine** (E/F/G present, Tier 2 prompt
contamination removed). Also the largest corpus: 104 sessions.

Her first attempt (old prompt, 30-day paid checks) never finished — the sequential
one-`claude -p`-call-per-session design is slow at this volume. The re-run front-loaded the free
checks and narrowed the paid window to 14 days.

## Commands

```bash
node engine/pilot-run.mjs          --repo <fleek-api> --days 30   # free
node engine/arc-builder.mjs        --repo <fleek-api> --days 45   # free
node engine/tier2-compare.mjs      --repo <fleek-api> --days 14   # paid
node engine/tier1-recall-audit.mjs --repo <fleek-api> --days 14   # paid
```

## Check 1 — Tier 1 heuristics

- **104 sessions** scanned (30 days) · **91 candidates (87.5%)**
- **E** fired on **37** sessions · **G** on **24** · **F** on **5**

Per-file rework detail:

| File | Edits in one arc |
|---|---|
| `product.ts` | **63×** |
| `babProductSnapshot.ts` | **36×** |
| backfill scripts | commonly 15–29× |

**This is the single most important calibration finding for E.** Its threshold of 4 was set
against frontend sessions where 7 edits to one file was the high end. On backend migration and
backfill work, 15–29 edits appears to be *normal*. E is badly mis-scaled for this repo.

**F, at 5/104, is by far the most selective new heuristic** and the most promising.

## Check 2 — Feature arcs (45-day window)

| Arc | Status | Span | Sessions | Turns | Edits/files | **Post-merge rework** |
|---|---|---|---|---|---|---|
| `docs/add-product-v2-migration` (PR #9566) | merged | 3.9d | 9 | 72 | 158 / 25 | **17** + 2 extensions |
| `SUP-238` (PR #9748) | merged | 1.3d | 8 | 71 | 49 / 10 | **5** |
| `feat/sea-shipping-backfill` | active (no PR) | 32.4d | 8 | 82 | 79 / 38 | — |
| `feat/backfill-bab-snapshot-cron` (PR #9487) | abandoned | — | — | — | — | — |

- **Both merged arcs had rework > 0.** `add-product-v2` at **17** is high.
- **0 post-merge commits landed as "unclassified"** — better than predicted, given ~34% of
  fleek-api commits lack conventional prefixes.
- No stale-branch warnings.

**This is the finding that refuted the earlier "0 rework" result.** Yugal's two arcs both showed
zero, flagged as suspicious rather than good news. The suspicion was correct — post-merge rework
is real and measurable, it just wasn't present in that particular frontend corpus.

fleek-api is also **fix-heavy** — 102 `fix:` vs 56 `feat:` in the last 300 commits on main,
inverted from fleek-monorepo — which is why it was the right place to test this.

## Check 4 — Tier 1 recall audit

- **7** non-candidate sessions checked · **3** possible misses

| Session | Confidence | Miss |
|---|---|---|
| `80b1a1d3` | **high** | Identical prompt *"the change went live on this friday"* sent **twice**; A did not fire — an intervening system message broke consecutive-turn detection |
| `451f0ded` | medium | *"Your earlier attempt didn't finish"* — cross-session retry, not covered by intra-session correction patterns |
| `d9dbff4a` | medium | *"the other session hanged"* + repeated `[Request interrupted by user]` — stalled execution, no existing category |

`80b1a1d3` is **a defect, not a gap** — A is under-firing on the literal case it was built for.
See [README §5](../README.md).

⚠️ **Caveat on `451f0ded`:** the phrase *"Your earlier attempt didn't finish"* is **our own prompt
text quoted back** — she pasted the instructions into her session, so the audit caught our
words, not hers. Real category, contaminated example.

The other two point at the same class Yash's audit found independently: **friction that is
neither a correction nor a repetition** — capability probing, stalled execution, cross-session
retry.

## Check 3 — Tier 2 model comparison: NEVER COMPLETED

Still running at ~50 sessions × 3 models when she reported; 7 sessions done, estimated 1–2
hours. **No follow-up was received.**

**Consequence: there are no fleek-api Tier 2 findings.** Every harness *finding* in this
exercise (BigQuery, `--no-verify`, ERD assertion, commit scope) comes from **fleek-monorepo**,
not fleek-api. Any fleek-api harness work must therefore be grounded in the **arc rework
commits** — real, verifiable git history — rather than ported from monorepo findings without
evidence they apply here.

## Unrelated blocker she raised

Custom connectors (their read-only BigQuery MCP on Fleek's own GCP) work in claude.ai chat but
are **not surfaced to Claude Code cloud sessions/routines** — the routine API rejects them.
Needs either workspace-level enablement for cloud sessions or org-approved connector status.
Not a Hone issue; logged here so it isn't lost.
