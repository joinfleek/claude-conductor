# Run 6 — Kishan Patel · fleek-monorepo · 2026-08-24

Post-cutoff, ran on **`feat/hone @ b6835d8`** — literally the cutoff commit. Reported 17:32 IST,
two hours after it landed.

Only `tier2-compare.mjs` was run; the prompt he received on 21 Aug predated the four-check
version and asked for that script alone. No `pilot-run`, `arc-builder` or recall audit.

## Engine version, verified independently of his claim

He stated the commit, but the report content confirms it without taking his word: sessions
`f819bc49`, `4884b8b2`, `d0e98274` and `04f20f56` carry `E-file-rework`, `F-scope-divergence` and
`G-high-iteration` tags, which did not exist before `b6835d8`.

He also ran across four parallel checkouts named `fleek-monorepo`, `fleek-monorepo-1`,
`fleek-monorepo-2` and `workspace/fleek-monorepo` — non-standard directory names that would have
tripped the basename bug from [run 2](02-lenvin-fleek-monorepo.md). `7ade2f9` (repo identity from
git remote) precedes `b6835d8` on the branch, so his run was already immune. **First confirmation
that fix holds in the wild.**

## Results

| Workspace | Transcripts | Candidates | haiku | sonnet (high) | opus (medium) |
|---|---|---|---|---|---|
| `Desktop/fleek-monorepo` | 28 | 25 | 7 | 1 | 2 |
| `Desktop/workspace/fleek-monorepo` | 4 | 3 | 0 | 1 | 0 |
| `Desktop/workspace/fleek-monorepo-1` | 11 | 8 | 5 | 0 | 0 |
| `Desktop/workspace/fleek-monorepo-2` | 16 | 13 | 5 | 1 | 1 |
| **Combined** | **59** | **49** | **17** | **3** | **3** |

All 147 Tier 2 calls (49 × 3) succeeded — **zero errors or malformed responses** per `hone.log`,
so every "no finding" is a genuine negative judgment rather than a swallowed failure. That is the
cleanest call-reliability result of any run.

Confidence spread: haiku 2 high / 13 medium / 2 low · sonnet 0/3/0 · opus 0/3/0.

**All 23 finding titles distinct.** No delegation-restatement cluster at all — the same result
[run 5](05-yash-fleek-monorepo-rerun.md) shows from the other direction, on a different corpus.

## Cross-model agreement was near-zero

Only **2 of 49** candidates had more than one model agreeing. README §6 records that cross-model
agreement tracks finding quality almost perfectly and proposes it as a free precision filter. On
this corpus that filter would keep 2 findings out of 23.

That is not necessarily a refutation — the two it keeps look strong (below) — but it does mean the
proposed 2-of-3 confidence tier is **far more aggressive than §6 implies**. On Kishan's data it is
closer to a 91% rejection rate than a precision filter. Worth knowing before it is implemented as
a gate.

## Findings

**sonnet (3):** silent-failure Sentry breadcrumb bug · external bug-report retraction ·
parallel-agent MCP overload.

**opus (3):** release-please changelog version drift · the same bug-report retraction · and:

> **A secret pasted inline during MCP server registration, persisting in
> `~/.claude/history.jsonl` and `~/.claude.json`** (session `2a16e984`, 2026-08-19). Flagged
> high-relevance.

**This is the single best-evidenced finding in the entire exercise.** It is the same failure class
as the clearest true positive from the original 10-session scoping run — a credential typed into a
transcript — now recurring independently, on a different developer's machine, weeks later. Two
occurrences, two people, one obvious mechanism (a `UserPromptSubmit` or `PreToolUse` hook that
refuses to let a credential-shaped string through).

It also does not depend on any open calibration question. Whatever gets decided about thresholds,
models or anchor selection, this finding stands.

**haiku's 2 high-confidence findings:** CI-gate bypass without confirming developer intent; and a
speculative architecture change shipped without device verification, after three failed TestFlight
hypothesis cycles before reverting.

## His own read, which is worth keeping

> *"This data point looks like AI-1's original 10-session run (haiku flags far more than
> sonnet/opus), and does NOT reproduce the 37-session calibration where haiku and sonnet ran at
> similar rates (18 vs 17)."*

Correct, and it became more interesting once [run 5](05-yash-fleek-monorepo-rerun.md) landed —
see [README §10](../README.md), where the two post-fix runs invert each other and jointly
undermine flag-rate comparison as a way to choose the default at all.

## Status

Never acknowledged. Reported 24 Aug, first read 26 Aug.
