# Run 8 — Sampada Kaushal · fleek-api · 2026-08-26

**Second backend run, sparsest corpus, and the run that found the most engine bugs.**

All four checks completed — the only run in the exercise where that is true. 19 sessions in 30
days, the smallest corpus measured, which turned out to be the point: it is the clearest contrast
against Aarushi's 104-session [run 4](04-aarushi-fleek-api.md) on the same repo.

Engine: cloned fresh on 2026-08-26, so post-`b6835d8`. Predates the incremental-write fix to
`tier2-compare.mjs` by a few minutes, which didn't matter — her run completed.

## Check 1 — 19 sessions → 14 candidates (74%)

C 14 · B 11 · D 8 · **G 6** · A 3 · **E 2** · **F 1**

74% is the **lowest Tier 1 flag rate recorded** (others: 79–91%). Still passes three sessions in
four.

### E's two hits are the cleanest evidence yet for the docs carve-out

| Session | File | Edits |
|---|---|---|
| `70f738c7` | `docs/claude-feedback-log.md` | 9 |
| `c925c7bf` | `docs/erd/HOLIDAY_MODE_AND_PRODUCT_AUDIT_ERD.md` | **60** (with `holidayModeConsumer.ts` next at **59**) |

Her framing: *"iterating on an ERD isn't the same failure as re-editing source until it works."*

**`c925c7bf` is the example that settles the design question.** An ERD at 60 edits and a source
file at 59 in the same session — one is authoring, one is plausibly rework, and they are one edit
apart. **No global threshold can separate them. A file-kind rule separates them trivially.**

This is the **third independent report** of E's documentation problem — Yugal (14×/26× on tracker
docs), Abhishek (four plan docs at 42/34/21/16 before the first code file), now Sampada. Three
developers, two repos, arrived at independently. See [README §6](../README.md).

She also independently reported that **`pilot-run.mjs` doesn't print the file/edit count** — she
had to pull it from the transcripts by hand. Same complaint Yash filed from
[run 5](05-yash-fleek-monorepo-rerun.md). Second independent report; it is now next-steps item 7.

## Check 2 — three arc-builder bugs, two of them root-caused

5 arcs: 2 merged, 2 abandoned, 1 active. **Both merged arcs had rework > 0** (3 and 6), 1
unclassified, no stale warnings. That corroborates Aarushi's finding on the same repo.

But she read her own numbers skeptically, and was right to.

### Bug 1 — arc-builder's churn is not repo-scoped, while E is

Her biggest arc, `chore/ai-harness-loop`, reports 1,779 edits across 281 files. Its top files:

```
345× /Users/sampadakaushal/Documents/fleek-api-handpick-erd/docs/erd/HANDPICK_SCHEDULING_ERD.md
126× /Users/sampadakaushal/Documents/fleek-api-handpick-erd/…/HANDPICK_SCHEDULING_API_CONTRACT.md
 56× /Users/sampadakaushal/Documents/fleek-api-videocall/…/videoCall.test.ts
 52× /Users/sampadakaushal/Documents/fleek-api-videocall/…/videoCall.ts
```

**Four of five are in different clones**, attributed to one branch in this checkout.

Root cause, confirmed in code. `heuristics.mjs:170` skips out-of-repo files outright:

```js
if (!inRepo(u.filePath)) continue; // scratch/Desktop files are not repo rework
```

`arc-builder.mjs:197` does no such thing — `toRepoRelative()` strips the repo prefix *if it
matches* and otherwise returns the absolute path unchanged. There is no filter anywhere in the
churn path.

**So E and arc-builder disagree by construction.** E was scoped to the repo after the
`~/Desktop/ds-review/index.html` incident ([README §9](../README.md)); arc-builder never was.
This is why her E fired on only 2 sessions while arc-builder reported a 345× file — they are
measuring different things and both are labelled "edits."

**Fix: apply the same `inRepo` filter in arc-builder's churn accumulation.** Small, and it
invalidates the churn figures in every arc report produced so far.

### Bug 2 — the window filters on file mtime, not session date

She noticed `feat/sheer-lace-skip-and-rotation` — **merged 2026-05-22** — appearing in a 45-day
window, with its 14-day post-merge rework measured on a three-month-old branch.

Root cause, confirmed: `resolve-transcript.mjs:27` builds the window from
`statSync(file).mtimeMs`, and every consumer filters `t.mtime >= cutoff`. **That is the file's
last-touched time, not when the session happened.** Resuming an old session — or anything that
rewrites the file — pulls a months-old conversation into a "last 14 days" window.

**This affects every windowed check in the system**, not just arc-builder: `pilot-run.mjs`,
`tier2-compare.mjs` and `tier1-recall-audit.mjs` all use the same filter. Every `--days N` figure
in every run record is approximate in an unquantified direction.

**Fix: derive the window from the first/last record `timestamp` inside the transcript**, which
the parser already reads.

### Bug 3 — commits and edits disagree, again

`feat/supplier-onboaridng`: **4 commits touching 2 files** against **161 edits across 58 files**.
Same class as Abhishek's three arcs showing 0 commits despite 46–314 attributed edits
([run 7](07-abhishek-fleek-monorepo.md)). Two developers, two repos. Not diagnosed.

Her own read, which is exactly right: *"Same file-level-coincidence shape you corrected in the
write-up."* The rework counts on her merged arcs carry the identical caveat established in
[`fleek-api-rework-analysis.md`](../fleek-api-rework-analysis.md), where only 5 of 13 attributed
fixes turned out to be genuinely introduced by the PR. `fix(search)`, `fix(shipping)` and
`fix(sub-eu-pricing)` against `feat/es-only-deactivation-slice-1` touch the same high-traffic
models everything touches. **Treat 3 and 6 as upper bounds, not counts.**

### Bug 4 — arc-builder writes no report file

stdout only. Every other script writes into `.claude/hone/reports/`. She had to redirect by hand.

## Check 3 — the sparsest signal measured, and the most informative single finding

10 sessions in the 14-day window. **haiku 1 · sonnet 1 · opus 0.** 27 of 30 calls returned
nothing.

Her framing is the right one: *"on my session mix the signal is very sparse, which may be the
useful contrast against Aarushi's run."*

### Sonnet's finding is grounded — and it indicts heuristic B

> **Ignored explicit 'one-liner' instruction, gave multi-paragraph answer** (medium)
> Developer explicitly asked for a one-liner RCA; Claude responded with two bolded multi-sentence
> sections. Developer replied **"one liner very easy answer"**, repeating the brevity request.

That is a real, verbatim, repeated developer correction. **Heuristic B did not fire on it** — the
session (`df4a21e7`) was flagged by **C alone**, the heuristic README §2 describes as "not a
filter."

So: the only sonnet finding in the run came from the weakest heuristic firing by itself, on a
session containing a textbook correction that the *correction-language* heuristic missed. Add
*"one liner very easy answer"* to the documented B-misses alongside *"I meant the fixes not the
placeholder changes"* ([README §5](../README.md)).

### Haiku's finding fabricates the `correctionGiven` field

> **Asks permission to construct artifacts instead of building them** (high)
> *Correction given:* "Claude should have directly built the structured script with seed data +
> test queries + assertions…"

**That is not a correction the developer gave.** It is the judge's own opinion, written into a
field whose entire purpose is recording what the human actually said. Sonnet's finding quotes a
real utterance in that field; haiku's invents one — and rates itself *high* confidence doing it.

This is a concrete, single-example demonstration of *why* haiku's flag counts run high, visible
without any cross-run comparison. It is better evidence about model choice than any of the
flag-rate tables in [README §10](../README.md), because it shows a **failure mode** rather than a
rate.

### Tier 2 discarded the E-flagged session again

`70f738c7` fired B, C, **E** and G — and all three models returned "no finding." Third
independent instance of the run-5 problem: E identifies the session, Tier 2 throws it away.
(`c925c7bf`, the 60-edit ERD session, fell outside the 14-day window and was never tested.)

## Check 4 — 2 non-candidates, 0 misses

Nothing found. As she notes, 2 of 19 is a thin sample either way. The recall audit's structural
limitation stands: it only ever samples *non*-candidates, which on a 74%-flag corpus means the
five shortest sessions.

## Minor

Her summary says 2,809 human turns on the biggest arc; the report says **2,817**. Immaterial, but
noted because it is the kind of drift that makes paraphrase a worse source than the file — which
is the lesson [run 7](07-abhishek-fleek-monorepo.md) is filed under.

## Status

Reported 2026-08-26 13:16 IST, ~30 minutes after being asked. All four reports attached and read.
