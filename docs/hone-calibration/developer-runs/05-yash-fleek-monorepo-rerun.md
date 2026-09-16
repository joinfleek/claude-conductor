# Run 5 — Yashvardhan Pandey · fleek-monorepo · 2026-08-24 (re-run)

**The first post-cutoff run, and the one that confirms the contamination fix worked.**

Same developer, same repo, same 30-day window as [run 3](03-yash-fleek-monorepo.md) — re-run a
few hours later on `feat/hone` pulled through **`b6835d8`** ("Add heuristics E/F/G, remove Tier 2
prompt contamination", 2026-08-24 15:23:07 IST). Because the corpus is held constant and only the
engine changed, this is the closest thing in the exercise to a controlled before/after.

Solicited by Yugal at 15:50 IST — *"the engine has changed significantly since"* — and reported
at 16:53 IST, with the report file attached at 17:08.

## ⚠️ This run was nearly lost twice

**Report filenames are UTC.** This file is `hone-tier2-compare-fleek-monorepo-2026-08-24T11-22-06.md`
— 11:22 **UTC**, which is 16:52 IST. Read as IST it looks like it predates the 15:23 cutoff by
four hours, and it was initially dismissed on exactly that basis. It does not; it postdates it by
ninety minutes.

**Content settles it, not the timestamp.** Session `c3230900` carries `E-file-rework`,
`F-scope-divergence` and `G-high-iteration` tags. Those heuristics did not exist before `b6835d8`.
Verified directly in the file: E fires on 20 sessions, F on 7, G on 9.

A second dismissal came from session-ID overlap with run 3 — the same nine-session "delegation
cluster" IDs appear in both. That proves the two files belong to the same *developer*, not the
same *run*: identical machine, identical window, so of course the same sessions are scanned.

**Rule: identify a run by its heuristic tags and per-model counts, never by filename time or
session IDs.**

## Results

| | Run 3 (pre-fix) | Run 5 (post-fix) |
|---|---|---|
| Tier 1 candidates | 37 | 36 |
| haiku | 18 | **6** |
| sonnet (effort=high) | 17 | **15** |
| opus (effort=medium) | 9 | **4** |
| Delegation restatements in sonnet's set | **9** | **0** |
| Genuinely distinct issues | ~8 of 17 (47%) | **~11–12 of 15 (73%)** |

New heuristic fire rates: **E 20/36 · F 7/36 · G 9/36**.

## The headline: 9 → 0

> *"THE KEY NUMBER: the delegation cluster is gone — 9 → 0. Not reduced, zero. Nothing in
> sonnet's 15 findings is a 'frontier model should have delegated to a cheaper tier' variant."*

[README §4](../README.md) asserted that the "delegation findings dominate" pattern was
substantially manufactured by our own prompt. Until this run that was an inference from reading
the prompt code. **This is the experimental confirmation** — same corpus, same model, contamination
removed, cluster gone entirely.

Distinct-yield rose from 47% to 73% without a model change, which is exactly what §10 predicted
would happen and used as its reason for keeping sonnet.

## Sonnet's 15 findings are mostly new content

Only three overlap conceptually with run 3's list (pre-commit `--no-verify`, unrequested push to
remote, general pre-commit hygiene). The rest are new and substantially more specific:

- async in-flight guard bug
- destructive-action text truncation
- dual-mode design signal missed
- hardcoded `en-US` locale
- `__DEV__` guard override
- bare string used where an enum exists
- incomplete enumeration presented as exhaustive

These are *code-level* observations. Run 3's set was dominated by process observations. That shift
is consistent with E/F/G routing the judge toward edit-bearing turns rather than conversational
ones.

## Three problems this run surfaced

**1. Tier 2 discards the heaviest-rework sessions.** All three models returned "no finding" on
`6d08ed5e` (33 edits), `f7d92f99` (34 edits) and `e70ee658` (9 edits) — sessions where *all seven*
heuristics fired. Yash flagged this himself.

E is doing its job; Tier 2 is throwing the result away.

> **⚠️ Corrected 2026-08-26 — the original diagnosis here was wrong, and wrong in a way that
> matters.**
>
> This section previously read: *"`sessionFacts()` passes counts but the judge still sees one
> ordinary edit at the anchor. The fix is probably anchor selection, not the prompt."*
>
> **`sessionFacts` was never passed in this run.** `tier2-compare.mjs:114` — the tool that
> produced every comparison number in runs 5, 6, 8 and 9 — calls `invokeTier2` with `heuristics`
> and `anchorDetail`, which `invokeTier2` does not accept and silently discards. Production
> (`assess.mjs:122`) passes `sessionFacts`; the calibration harness does not, and never has.
>
> So the judge **literally never saw the edit counts** on these sessions. It was shown a six-turn
> excerpt containing one ordinary edit and asked whether anything went wrong. Returning "no
> finding" was the correct answer to the question it was actually asked.
>
> This is very likely not an anchor-selection problem at all. See
> [README §4a](../README.md).

**2. `pilot-run.mjs` never prints E's detail.** The file path and edit count live in the anchor
objects and never reach the report. Every developer asked for E's detail has had to pull it from
`arc-builder.mjs` instead. Yash's suggestion, verbatim:

> *"the pilot report itself doesn't print the E-file-rework file/edit-count detail — that lives in
> the anchor objects... Might be worth surfacing the anchor `detail` in the report directly."*

**3. Recall audit unchanged.** 16 non-candidates checked (17 in run 3), same single flag
`de2780f9`, same verbatim phrases. Consistent, not new — which is itself mildly reassuring about
run-to-run stability of the free checks.

## Status

Never acknowledged. Reported 24 Aug, first read 26 Aug.
