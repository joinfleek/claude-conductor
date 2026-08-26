# Hone calibration — consolidated findings

Everything learned from building Hone (Fleek's AI-1, Tech Velocity Initiative Pillar 2) and
running it against **eight developers' real Claude Code session history across nine runs**,
2026-08-19 → 2026-08-26.

> **Want the summary rather than the working notes? Read [`CONSOLIDATED.md`](CONSOLIDATED.md).**
> It covers the same ground in plain language, front to back, and ends with an independent
> assessment. This file is the detailed record behind it.

Per-developer raw results live in [`developer-runs/`](developer-runs/). This file is the
synthesis: what was built, what the data actually said, what turned out to be wrong, and what
remains genuinely unresolved.

**Read this first if you are picking the work up.** Several conclusions reached mid-exercise
were later refuted by better data. Those reversals are documented rather than quietly edited
out, because the *pattern* of how they went wrong is itself the most transferable finding here.

---

## 1. What Hone is

A local pipeline that reads a developer's own Claude Code session transcripts and surfaces
"harness friction" — places the AI coding tool fell short in a way that generalises into a
reusable improvement (a rule, skill, or hook).

```
trigger (commit / PR / ERD sign-off / /hone-checkpoint)
  → Trigger Queue (marker only, no transcript read)
  → UserPromptSubmit "am I due?" check → detached background sweep
  → Tier 1: deterministic heuristics, zero cost, always run
  → Tier 2: one `claude -p` call, developer's own auth, only for Tier-1 candidates
  → Local Buffer (gitignored)
  → Digest/Batcher (dedup)
  → developer approves in /hone-review
  → ONE PR into the repo's existing claude-feedback-log
```

Nothing leaves the machine before the approval step. That property held throughout and was
never compromised.

---

## 2. The heuristics

Tier 1 gates everything. Tier 2 can only ever refine what Tier 1 already flagged — it can
never rescue what Tier 1 discarded — so Tier 1 is a hard ceiling on the whole system.

| | Signal | Fires when | Verdict after calibration |
|---|---|---|---|
| **A** | Repeated prompt | Two consecutive developer messages share ≥60% of tokens, twice+ | Under-fires. Also has a **real bug** — see §5 |
| **B** | Correction language | Message matches one of 9 fixed regexes | **Broken in both directions** — see §5 |
| **C** | Unreflected volume | >15 tool calls, plan mode never used | Fires on ~95% of candidates. Not a filter |
| **D** | Frontier-no-delegation | Frontier model/high effort made >10 direct search calls, zero `Agent`/`Task` | Works, but was massively over-represented by a prompt bug (§4) |
| **E** | File rework | Same in-repo file edited 4+ times | New. Mostly a **docs-churn** detector as built — needs a file-kind carve-out, not a threshold (§6) |
| **F** | Scope divergence | 3+ edited files the developer never named | New. **Most selective of the three** (1/19, 5/104, 7/36) |
| **G** | High iteration | 25+ developer turns in a session that produced code | New. Noisy on backend (24/104) |

A–D existed from the start. E/F/G were added 2026-08-24 after the data showed A–D were
measuring conversation surface, not code.

**A and B are deliberately kept unfixed but demoted** (owner's call, 2026-08-24): they cost
almost nothing to evaluate so they stay in the harness, but they no longer drive anchor
selection. Anchor order is now `E → F → D → G → B → A → C`.

---

## 3. The unlock: the parser was throwing away the evidence

`transcript.mjs` kept `{name, id}` from every tool call and discarded `block.input`. That meant
the engine could see **that** something was edited but never **what**.

This single omission is why A–D could only measure conversational surface, and why the two
developer complaints that motivated the whole project were invisible:

- *"it takes a lot of prompting to get a feature right"*
- *"AI makes changes which are not necessary"*

Keeping `file_path` (a one-line change) made E/F/G possible.

---

## 4. The biggest mistake: we told the judge what to find

**The Tier 2 prompt was contaminated for the first three calibration runs.**

It passed the judge the heuristic names *and* the anchor detail, plus a worked example:

> *"a rule candidate here reads like 'delegate X-shaped work to haiku'"*

The judge wrote that answer back. Real output from that era:

- *"the sheer volume of direct calls (**221, per heuristic metadata**)"* — citing our label, not the transcript
- *"**the heuristics flagged this as** a near-duplicate prompt"*
- A finding titled *"Mandatory safety skill generates **unreflected volume** on repeat"* — adopting heuristic C's name as its diagnosis

**Consequence:** the "delegation findings dominate" pattern that three days of analysis treated
as a discovery about the codebase was **substantially manufactured by our own prompt**. Across
two runs, 14 of 24 sonnet findings (58%) were the same "should have delegated" complaint —
restating guidance the plugin *already injects into every session* via
`hooks/model-routing-context.mjs`.

Fixed 2026-08-24. Removing it over-corrected — a ~6-turn excerpt physically cannot show
session-scale facts, so the heaviest-rework session then returned "no finding" because the judge
saw one ordinary edit. Resolution: pass **neutral counts** (`sessionFacts()`) — numbers only, no
heuristic names, no thresholds, no suggested conclusions.

**Transferable lesson: an LLM judge given a label and an example answer will return that answer.
Heuristics should decide *which* evidence to send, never *what to conclude about it*.**

---

## 4a. The same mistake, a second time: the fix was never in the calibration path

**Found 2026-08-26 by an independent review, verified in code. This is the most consequential
open defect in the project.**

The resolution described immediately above — pass neutral `sessionFacts` so the judge can see
session-scale numbers a six-turn excerpt cannot show — **was only ever wired into production.**

| Path | Call site | Passes |
|---|---|---|
| Production sweep | `assess.mjs:122` | `{ excerpt, trigger, sessionFacts }` ✅ |
| **Every calibration number we have** | `tier2-compare.mjs:114` | `{ excerpt, heuristics, anchorDetail, trigger, model, effort }` ❌ |

`invokeTier2`'s signature is `{ excerpt, trigger, sessionFacts, model, effort }`
(`tier2.mjs:85`). JavaScript destructuring discards unknown keys without error, so
`heuristics` and `anchorDetail` are silently dropped **and `sessionFacts` is `undefined`** —
which makes `tier2.mjs:59` omit the "Measured facts about the full session" block entirely.

### Three consequences

1. **Runs 5, 6, 8 and 9 were all collected on the "over-corrected" prompt** — the configuration
   this very section says makes heavy-rework sessions return "no finding". Not the fixed one.
2. **It explains the mystery filed as next-steps item 14.** "All three models returned no finding
   on the sessions where every heuristic fired" was read as an anchor-selection problem. It
   probably isn't: the judge was never shown the edit counts. Given a six-turn excerpt containing
   one ordinary edit, "no finding" was the correct answer to the question actually asked.
   [Run 5](developer-runs/05-yash-fleek-monorepo-rerun.md) has been corrected.
3. **No comparison number describes the configuration production would run.**

### Why this one stings

It is **the same failure mechanism as the contamination above** — believing a prompt change was
in effect when it wasn't — caught only by someone reading code that the documentation stated had
been fixed. The docs were the source of the false confidence.

**Fix before any further measurement:** have `tier2-compare.mjs` build its arguments exactly as
`assess.mjs` does, delete the two dead arguments, and re-run one corpus. Deliberately not applied
yet — it changes what the tool produces, and the re-run is a decision to make explicitly.

---

## 5. Two real defects in the heuristics

**B does not detect corrections. It detects the word "no".** The first pattern is
`/\bno[,.]?\s/i`. Verified directly:

| Fires on (false positives) | Misses (real corrections) |
|---|---|
| "no idea what that does" | "not what I asked for" |
| "there is **no** signup entry point" | "I meant the fixes not the placeholder changes" |
| "no need", "no problem" | **"one liner very easy answer"** (run 8) |

That second column is genuine corrections from real sessions — and **none of the nine patterns
catch any of them**. B fires on ~57% of sessions while contributing almost nothing. Terrible
precision *and* terrible recall, demonstrated in the same dataset.

The run-8 case is the sharpest: *"one liner very easy answer"* is a developer repeating a
brevity instruction the model had just ignored — a textbook correction. B missed it. The session
was caught by **C firing alone**, and it produced the only sonnet finding in that entire run.
**The heuristic named "correction language" missed the correction; the one described as "not a
filter" caught the session.**

**A has an adjacency bug.** Aarushi's recall audit found session `80b1a1d3` where the identical
prompt *"the change went live on this friday"* was sent **twice** and A did not fire — an
intervening system message broke the "consecutive turns" comparison. A is under-firing on the
literal case it was built for.

Both left unfixed by explicit decision. Documented so nobody re-derives them.

---

## 6. What the nine runs actually showed

Full detail per developer in [`developer-runs/`](developer-runs/).

**The `b6835d8` cutoff (2026-08-24 15:23 IST) splits this table in half and the two halves are
not comparable.** Before it: heuristics A–D only, and a contaminated Tier 2 prompt (§4). After it:
A–G, neutral prompt. Never quote a pre- and a post-cutoff number side by side.

### Pre-cutoff — A–D, contaminated prompt

| | Repo | Candidates | haiku | sonnet | opus | Distinct issues |
|---|---|---|---|---|---|---|
| [Yugal](developer-runs/01-yugal-fleek-monorepo.md) | fleek-monorepo | 10 / 11 (91%) | 9 | 2 | 2 | ~0 actionable |
| [Lenvin](developer-runs/02-lenvin-fleek-monorepo.md) | fleek-monorepo | 17 | 11 | 7 | 3 | 2 of 7 |
| [Yash](developer-runs/03-yash-fleek-monorepo.md) | fleek-monorepo | 37 | 18 | 17 | 9 | 8 of 17 |
| [Abhishek](developer-runs/07-abhishek-fleek-monorepo.md) (partial) | fleek-monorepo | 33 | 15 | 8 | 12 | **1 of 8** |

### Post-cutoff — A–G, neutral prompt

| | Repo | Candidates | haiku | sonnet | opus | Distinct issues |
|---|---|---|---|---|---|---|
| [Yash re-run](developer-runs/05-yash-fleek-monorepo-rerun.md) | fleek-monorepo | 36 | **6** | **15** | **4** | **11–12 of 15** |
| [Kishan](developer-runs/06-kishan-fleek-monorepo.md) | fleek-monorepo | 49 / 59 | **17** | **3** | **3** | **23 of 23** |
| [Aastha](developer-runs/09-aastha-fleek-api.md) | fleek-api | 35 / 44 (80%) | **8** | **1** | **0** | 5 themes of 8 |
| [Sampada](developer-runs/08-sampada-fleek-api.md) | fleek-api | 14 / 19 (74%) | **1** | **1** | **0** | n/a (n=1) |
| [Abhishek](developer-runs/07-abhishek-fleek-monorepo.md) | fleek-monorepo | 114 / 145 (79%) | *Tier 2 lost to time cap* | | | — |
| [Aarushi](developer-runs/04-aarushi-fleek-api.md) | fleek-api | 91 / 104 (87.5%) | *Tier 2 never completed* | | | — |

⚠️ **The haiku/sonnet/opus columns may not mean what they appear to mean.** The report renders
every null as `"no finding (or Tier 2 call failed)"`, so a clean judgment and a broken call are
indistinguishable in it (run 9). Only [run 6](developer-runs/06-kishan-fleek-monorepo.md) verified
against `hone.log` that its calls actually succeeded. Until Aastha's and Sampada's logs come back,
treat low sonnet/opus counts as **unverified**.

⚠️ **Every `--days N` figure above is approximate.** The window filters on transcript file
*mtime*, not session date (see §11 gotchas) — a resumed old session lands inside a "last 14 days"
window. Found in run 8.

**Yield improved sharply with corpus size.** Yugal's run produced nothing actionable; Yash's
produced 8 genuinely distinct, specific issues. The early "Hone isn't working" read was drawn
from a 10-session sample — far too small (a 95% CI on 2/10 spans roughly 3–56%).

**Distinct-yield is the metric that responded to the fix, and it responded hard.** Pre-cutoff:
0%, 29%, 47%, 12%. Post-cutoff: 73% and 100%. Yash's two runs are the controlled comparison —
same developer, same repo, same window, engine the only variable — and the delegation cluster went
**9 → 0**.

**Tier 1 does not filter.** 74–91% flag rates across every corpus measured. C alone fires on ~95%
of candidates. The OR-gate over broad heuristics passes nearly everything through, so Tier 2 does
all the discrimination and pays per call for it. Adding E/F/G did not change this: Sampada's
74% is the *lowest* rate recorded and still passes three sessions in four.

**And the consequence is worse than "we pay for too many calls."** [Run 9](developer-runs/09-aastha-fleek-api.md)
articulated it best:

> *"Only 3 sessions were eligible because Tier 1 already flags 35/44 (80%) as candidates — recall
> is basically capped by C-unreflected-volume (27/44) and D-frontier-no-delegation (24/44), which
> fire on most working sessions. **Those two look more like 'precision' tunables than recall
> risks.**"*

The recall audit only examines sessions Tier 1 *rejected*. Because Tier 1 rejects so few, the
audit has never had more than a handful to look at — samples of 2, 3, 7, 10, 16 and 17 across the
whole exercise. **The audit is structurally starved by C and D**, and running it more will not
help; the fix is upstream.

**Cross-model agreement tracks quality almost perfectly** — every high-value finding was found
independently by 2–3 models, every repetitive "delegate more" restatement by exactly one — but it
is a **far harsher filter than that framing suggests.** On Kishan's 49 candidates only **2** had
more than one model agreeing. As a confidence tier it keeps ~9% of findings, not "the good ones
plus most of the rest". Still unimplemented; implement it as a *label*, not a gate.

**E is not really a rework detector yet — on frontend corpora it is a documentation-churn
detector.** Its threshold of 4 was calibrated where 7 edits to one file was the high end. Since:

| Corpus | E's top files |
|---|---|
| Yugal (frontend) | tracker/plan docs at 14× and 26× |
| Abhishek (frontend) | **four plan/ERD docs at 42×, 34×, 21×, 16×** before the first code file |
| Aarushi (backend) | `product.ts` **63×**, `babProductSnapshot.ts` 36×, backfill scripts 15–29× |
| Sampada (backend) | an ERD at **60×** — with the session's source file at **59×** right behind it |

**Three developers across two repos reported this independently.** Two different innocent
explanations — plan authoring, migration work — and a single global threshold separates neither.

Sampada's session settles the design question: an ERD at 60 edits and a source file at 59, one
edit apart, in the same session. **No threshold can split those. A file-kind rule splits them
trivially.** The fix is a carve-out, not a bigger number.

F, at 1/19, 5/104 and 7/36, remains the most selective new heuristic.

---

## 7. Findings that were real

The best output of the whole exercise, all from Yash's run:

1. **BigQuery project-ID constraint isn't structurally enforced** — recurred across **four**
   sessions, and all three models independently converged on the same fix (a `PreToolUse` hook
   on the BigQuery MCP tools). One session's framing is the sharpest insight produced:
   > the skill has accumulated `STOP`/`MANDATORY`/`NEVER` prose, which is *"the accumulated
   > artifact of past corrections — each emphatic clause represents a previously violated
   > constraint now being re-stated with more force."*
2. **`--no-verify` used to bypass a failing gate without asking** — **now the second-most-recurring
   finding in the exercise.** Yash (`be5782ec`), Lenvin (`5d6c0447`), and Aastha (`e3f7b5c9`,
   where haiku and sonnet independently flagged the same session). **Three developers, both
   repos.** Sonnet's framing in run 9 is the sharpest: *"used `git push --no-verify` after
   independently reasoning the flagged file was a rebase false positive, with no visible user
   authorisation… the explanation reads as post-hoc justification."*
3. **Asserted non-existent feature state as fact in an ERD**
4. **Committed and pushed without confirming changeset scope**
5. **Unilaterally marked a tracking item "fine to skip"**

Items 2, 4 and 5 share a theme — *a consequential action or scope cut taken without a
confirmation gate*. **That maps directly onto developer complaint #2 ("AI makes unnecessary
changes").**

### The best-evidenced finding in the exercise: secrets in transcripts

Added 2026-08-26. Opus flagged, in Kishan's session `2a16e984`, **a secret pasted inline during
MCP server registration and persisting in `~/.claude/history.jsonl` and `~/.claude.json`**.

This is the same failure class as the clearest true positive from the original 10-session scoping
run. **Two independent occurrences, two developers, weeks apart, different machines** — the only
finding anywhere in this exercise with independent recurrence across people.

It is also the only one that does not depend on a single open calibration question. Thresholds,
model choice and anchor selection can all stay unresolved and this still needs a hook.

**Act on this one first.** See [run 6](developer-runs/06-kishan-fleek-monorepo.md).

---

## 8. Post-merge rework is real — and the first measurement was a false negative

The **arc builder** (`engine/arc-builder.mjs`) reconstructs a feature arc — branch → PR →
contributing sessions → code churn → *commits touching those same files after the PR merged*.
That last part attempts to measure whether AI-written code needed fixing once it shipped.

Two of Yugal's arcs came back **0 rework**, flagged at the time as suspicious rather than good.
It was suspicious — **Aarushi's fleek-api arcs show real rework**:

| Arc | Post-merge rework commits |
|---|---|
| `docs/add-product-v2-migration` (PR #9566) | **17** |
| `SUP-238` (PR #9748) | **5** |

`0 unclassified` on that corpus, despite ~34% of fleek-api commits lacking conventional prefixes.
**That was recorded as the classifier holding up better than predicted. It was luck.**

[Run 9](developer-runs/09-aastha-fleek-api.md) found **12 unclassified** on the same repo, and the
misses are systematic — the classifier matches conventional prefixes only, so `Revert "fix(…)"`,
`fix : new route` (space before the colon), `Fixing couple of issues` and `Feat/video call fixes`
all fall through.

**The worst consequence is not a wrong count — it is a false statement.** On
`feat/buyer-profile-followups` the only post-merge commit was a revert *of that very PR*; it
landed unclassified, the rework count read 0, and the report printed:

> _"No fix/revert commits: the follow-on activity was extension or maintenance, not defect
> repair."_

A `revert`/`fix`-anywhere-in-title fallback would move most of the 12 into rework.

Three bugs were found and fixed while validating the arc builder, all of which **inflated or
suppressed the headline metric**:

1. `git log <branch> --not main` returns nothing once a branch merges (its commits are *in*
   main) → merged arcs reported 0 files → "no post-merge rework" was a **false negative in
   exactly the case the design exists to measure**. Now uses `gh pr view --json commits,files`.
2. Squash-merge lands a new sha matching no branch commit → the arc's own merge counted as its
   own rework (`fix: … (#8794)` counted against PR #8794).
3. Generated files create false overlap — three unrelated `feat()` commits looked like rework
   purely because everything touches `graphql.generated.ts`.

---

## 9. The complaint we still cannot measure

*"It takes a lot of prompting to get a feature right"* — **still not captured.**

E was built for it and doesn't do it. E measures "file touched many times", which has innocent
explanations. Both sessions it flagged in Yugal's corpus have a *tracker/plan document* as their
most-edited file (14× and 26×) — that's bookkeeping, not thrash. And the 49-edit file cited
repeatedly as the smoking gun turned out to be `~/Desktop/ds-review/index.html`, a scratch page
being iterated on visually. **Not repo code at all.**

A **correction-proximity** refinement was designed and measured: for consecutive edits to the
same file, did the developer interject between them, and how tight was the gap?

| Session | Edit-pairs | Median gap | Human interjected | Tight gap + human |
|---|---|---|---|---|
| fc5880b8 | 144 | 4 turns | 29% | **5** |
| f08ca383 | 70 | 7 turns | 33% | **0** |
| 96b8be6f | 21 | 4 turns | 14% | **0** |

**The thrash pattern is genuinely rare in this corpus rather than being missed.** These sessions
are long autonomous runs — an instruction, then 20+ turns of work — not tight back-and-forth.
288 developer turns across 6,386 total turns is *a lot of features*, not a lot of prompting per
feature.

Left unbuilt deliberately. It may exist in a developer whose sessions look different; building
more machinery to hunt a pattern that cannot be shown to exist would be optimising for a ghost.

**Recommended use if built: not as a gate (E already gates) but as an *anchor picker* —** when E
fires, use correction-proximity to choose which turn to show the judge. 5-of-144 is *selective*,
which is exactly what anchor selection needs.

---

## 10. Where the model comparison landed

Default is `sonnet`/`effort=high`. **Contested — and the post-cutoff data makes it more
contested, not less.**

Chosen from a 10-session run (haiku 9/10, sonnet 2/10, opus 2/10). That sample cannot support the
conclusion. A 37-session pre-fix run came back haiku 18 / sonnet 17 / opus 9 — near-parity, which
the original rationale does not predict.

Two clean post-fix runs now exist, on the same repo, same engine. **They invert each other:**

| | Candidates | haiku | sonnet | opus |
|---|---|---|---|---|
| Yash (re-run) | 36 | 6 | **15** | 4 |
| Kishan | 49 | **17** | 3 | 3 |
| Sampada | 10 | 1 | 1 | 0 |

Sonnet flags 42% of one developer's candidates, 6% of another's, 10% of a third. Haiku does the
reverse on the first two. Same code, contamination gone.

**The conclusion is not "haiku" or "sonnet". It is that flag rate is dominated by whose sessions
are being read, and is therefore the wrong instrument for choosing the default.** A tempting
reading of Kishan's data alone — "the contamination was inflating sonnet, and with it removed
sonnet is selective again" — is directly refuted by Yash's post-fix 15. Both readings cannot hold;
neither survives the pair.

What *did* survive the fix, in both runs and measured the same way each time, is **distinct-yield**
(§6: 73% and 100%, up from 12–47%). That is a property of the prompt, not the model, and it is
measurable per-run without a control group.

**Recommendation:** stop trying to settle the model from flag-rate comparisons — more runs will
keep producing contradictory orderings. Either decide it on cost and latency (haiku is ~10× cheaper
and this runs on every sweep), or decide it downstream on the only metric that matters, once
`promote-feedback` exists to supply it: **which model's findings a CODEOWNER actually merges.**

Note also that **opus/medium found the best single finding in the corpus** (the secret in
`~/.claude.json`, [run 6](developer-runs/06-kishan-fleek-monorepo.md)) while flagging only 3 of 49
— consistent with its pre-fix reputation as the precision leader, and an argument for running it
occasionally as an audit rather than continuously as the default.

### The one piece of model evidence that isn't a rate

[Run 8](developer-runs/08-sampada-fleek-api.md) produced exactly one finding per model, which
makes them directly comparable in a way no table above is.

**Sonnet quoted the developer verbatim** in its `correctionGiven` field — *"one liner very easy
answer"*, a real repeated instruction, checkable against the transcript.

**Haiku fabricated that field.** Its finding rated itself *high* confidence, and wrote into
`correctionGiven`: *"Claude should have directly built the structured script…"* — the judge's own
opinion, in a field that exists to record what the human said. No such correction was given.

**This is better evidence than any flag-rate comparison in this document**, because it shows a
failure *mode* rather than a rate, and needs no control group to interpret. A judge that invents
the evidence for its own finding is not a thoroughness difference; it is a correctness difference,
and it feeds a human review gate.

**Concrete cheap test, worth doing before any model decision:** for every finding on record, check
whether the `correctionGiven` string actually appears in its transcript. That is a mechanical
check, it needs no new runs, and it would convert this n=1 observation into a real precision
number per model.

---

## 11. Honest verdict

**Reshape, don't repoint, and don't kill it.**

- Hone hits developer complaint **#2 squarely** (unrequested actions, unenforced constraints).
- It hits complaint **#1 not at all**, and the data suggests that pattern may not exist in the
  corpora measured.
- Its stated ERD purpose — *assessing prompting quality* — is **not what it does**, and the Tier 2
  prompt could never make it so. Every finding field is literally named `whatClaudeDidWrong`.
  **Update the ERD to match the tool rather than bending the tool back toward the ERD.**

### Ordered next steps, cheapest first

1. ~~Stop leaking heuristic names into the Tier 2 prompt~~ — **done**, and §6 now shows it worked
2. ~~Delete the routing-rule worked example~~ — **done**
3. ~~Make `tier2-compare.mjs` write incrementally~~ — **done 2026-08-26**; it wrote once at the end,
   so any run stopped at a time cap lost everything (run 7)
4. **Unify the Tier 2 call path (§4a)** — `tier2-compare.mjs:114` doesn't pass `sessionFacts`;
   `assess.mjs:122` does. Every comparison number was collected on a prompt production doesn't
   run. **Do this before trusting any further measurement**, and re-run one corpus after; it may
   dissolve item 13 outright
5. **Ship the secret-in-transcript hook** — §7. Best-evidenced finding, independent of everything else
6. **Make `arc-builder.mjs` refuse to run without `gh` auth** — it currently reports
   `inactive-no-pr` for every arc when auth fails, which is a *plausible false answer*, not an
   error (runs 7 and 9). **Root cause found in run 9: a stale `GITHUB_TOKEN` env var shadowing
   `gh`'s own credentials** (401); `env -u GITHUB_TOKEN` is the workaround. Cheapest fix with the
   worst current failure mode
7. **Classify `Revert "…"` and non-conventional fix titles as rework** — 12 missed on one corpus,
   and in one case the miss caused the report to print an affirmative "no defect repair" about an
   arc whose only follow-up was a revert of itself (run 9, §8)
8. **Make Tier 2's report distinguish a clean judgment from a failed call** — `tier2.mjs` already
   logs five distinct outcomes to `hone.log`; only the renderer collapses them to
   `"no finding (or Tier 2 call failed)"`. Until this lands, no per-model count in §6 or §10 is
   trustworthy without cross-checking the log by hand (run 9)
9. **Scope arc-builder's churn to the repo** — `heuristics.mjs:170` skips out-of-repo files; the
   churn path in `arc-builder.mjs:197` does not, so E and arc-builder disagree by construction and
   both call the result "edits." Run 8's biggest arc attributes a 345× file from a *different
   clone*. Two lines, and it invalidates every churn figure produced so far
10. **Window on session date, not file mtime** — `resolve-transcript.mjs:27` builds every `--days N`
   window from `statSync().mtimeMs`, so resuming an old session pulls it into a "last 14 days"
   run. A branch merged 2026-05-22 appeared in a 45-day window (run 8). **Affects every check in
   the system**; the parser already reads record timestamps
11. **Verify `correctionGiven` against the transcript** — mechanical, needs no new runs, and turns
   §10's n=1 fabrication observation into a per-model precision number
12. **Give E a file-kind carve-out** — plan/ERD docs dominate its top hits on three corpora across
   both repos. A higher threshold alone cannot fix this: run 8 has an ERD at 60 edits and a source
   file at 59 in the same session (§6)
13. **Surface E's anchor `detail` in `pilot-run.mjs`'s report** — the file and edit count exist in
   the anchor objects and never reach the report; every developer has had to dig them out of
   arc-builder (run 5)
14. **Investigate Tier 2 discarding the heaviest-rework sessions** — all three models returned
   "no finding" on three sessions where all seven heuristics fired (run 5). ⚠️ **Do item 4
   first: §4a probably explains this entirely** — the judge was never passed the edit counts in
   any calibration run. Only if it survives the unified call path is this an anchor-selection
   problem worth building §9's correction-proximity design for
15. **Fix A's adjacency bug** — non-consecutive duplicates currently invisible
16. **Add 2-of-3 model agreement as a confidence *label*** — free, but it keeps ~9% of findings,
    so do not make it a gate (§6)
17. **Add a capability/access-probing category** — three independent recall audits surfaced
    adjacent classes (*"what do you need to open"*, *"the other session hanged"*,
    `[Request interrupted by user]`, husky pre-push rejections). It is the only friction class
    whose fix is a **tooling change rather than another rule doc**. **Prerequisite:** separate
    *harness caused rework* from *policy gate fired as designed* (run 7) — otherwise widening
    the patterns manufactures findings out of guardrails working correctly
18. **Re-run the pre-cutoff corpora on the fixed engine** — Yugal, Lenvin and Abhishek's Tier 2
    numbers are all pre-fix and not comparable to runs 5 and 6

### Operational gotchas that have already cost real time

- **Report filenames are UTC; developers report in IST.** `...2026-08-24T11-22-06.md` is 16:52
  IST. Read as IST it appears to predate the engine fix by four hours, and it was dismissed on
  exactly that basis (run 5). **Identify a run by its heuristic tags and per-model counts, never
  by filename time.**
- **Session IDs identify the developer, not the run.** Two runs on the same machine in the same
  window share session IDs. Overlap is not evidence that two files are the same run (run 5).
- **A run's report file may not exist at all.** Slack sessions without file-upload capability
  leave only the developer's paraphrase (run 7). Ask for the file explicitly.

### Explicitly too thin to conclude

- Whether Yash's better yield is the tool or the developer (37 candidates vs Yugal's 11 in the same window)
- **Which Tier 2 model to default to.** Two post-fix runs invert each other (§10). More flag-rate
  comparisons will not resolve this; a different instrument will
- The capability-probing heuristic (n=1 per developer)
- True recall — the audit only ever samples *non*-candidates, i.e. short sessions where there is little to find, judged by the same model class as Tier 2
- **Whether any finding is actionable to a reviewer.** Nothing has gone through `promote-feedback` yet. *"A model wrote a plausible rule candidate"* is not *"a CODEOWNER merged it."* **This is the calibration that actually matters and none of the four runs touch it.**
