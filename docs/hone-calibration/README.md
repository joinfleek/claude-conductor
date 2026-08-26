# Hone calibration — consolidated findings

Everything learned from building Hone (Fleek's AI-1, Tech Velocity Initiative Pillar 2) and
running it against four developers' real Claude Code session history, 2026-08-19 → 2026-08-26.

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
| **E** | File rework | Same in-repo file edited 4+ times | New. Threshold wrong for backend (§6) |
| **F** | Scope divergence | 3+ edited files the developer never named | New. **Most selective of the three** (5/104) |
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

## 5. Two real defects in the heuristics

**B does not detect corrections. It detects the word "no".** The first pattern is
`/\bno[,.]?\s/i`. Verified directly:

| Fires on (false positives) | Misses (real corrections) |
|---|---|
| "no idea what that does" | "not what I asked for" |
| "there is **no** signup entry point" | "I meant the fixes not the placeholder changes" |
| "no need", "no problem" | |

That second column is a genuine correction from a real session — and **none of the nine patterns
catch it**. B fires on ~57% of sessions while contributing almost nothing. Terrible precision
*and* terrible recall, demonstrated in the same dataset.

**A has an adjacency bug.** Aarushi's recall audit found session `80b1a1d3` where the identical
prompt *"the change went live on this friday"* was sent **twice** and A did not fire — an
intervening system message broke the "consecutive turns" comparison. A is under-firing on the
literal case it was built for.

Both left unfixed by explicit decision. Documented so nobody re-derives them.

---

## 6. What the four runs actually showed

Full detail per developer in [`developer-runs/`](developer-runs/).

| | Repo | Candidates | haiku | sonnet | opus | Distinct issues |
|---|---|---|---|---|---|---|
| Yugal | fleek-monorepo | 10 / 11 (91%) | 9 | 2 | 2 | ~0 actionable |
| Lenvin | fleek-monorepo | 17 | 11 | 7 | 3 | 2 |
| Yash | fleek-monorepo | 37 | 18 | 17 | 9 | **8** |
| Aarushi | fleek-api | 91 / 104 (87.5%) | *Tier 2 never completed* | | | — |

**Yield improved sharply with corpus size.** Yugal's run produced nothing actionable; Yash's
produced 8 genuinely distinct, specific issues. The early "Hone isn't working" read was drawn
from a 10-session sample — far too small (a 95% CI on 2/10 spans roughly 3–56%).

**Tier 1 does not filter.** 87–91% flag rates. C alone fires on ~95% of candidates. The OR-gate
over broad heuristics passes nearly everything through, so Tier 2 does all the discrimination
and pays per call for it.

**Cross-model agreement tracks quality almost perfectly.** Every high-value finding was found
independently by 2–3 models; every repetitive "delegate more" restatement by exactly one. This
is a free precision filter that is **still not implemented**.

**E's threshold is wrong for backend work.** Calibrated on frontend sessions where 7 edits to
one file was the high end. In fleek-api, `product.ts` was edited **63×** and
`babProductSnapshot.ts` **36×**; backfill scripts routinely hit 15–29×. On backend migration
work those counts appear to be normal. E fired on 37/104 sessions there. F, at 5/104, is by far
the most selective new heuristic.

---

## 7. Findings that were real

The best output of the whole exercise, all from Yash's run:

1. **BigQuery project-ID constraint isn't structurally enforced** — recurred across **four**
   sessions, and all three models independently converged on the same fix (a `PreToolUse` hook
   on the BigQuery MCP tools). One session's framing is the sharpest insight produced:
   > the skill has accumulated `STOP`/`MANDATORY`/`NEVER` prose, which is *"the accumulated
   > artifact of past corrections — each emphatic clause represents a previously violated
   > constraint now being re-stated with more force."*
2. **`--no-verify` used to bypass a failing pre-commit gate without asking**
3. **Asserted non-existent feature state as fact in an ERD**
4. **Committed and pushed without confirming changeset scope**
5. **Unilaterally marked a tracking item "fine to skip"**

Items 2, 4 and 5 share a theme — *a consequential action or scope cut taken without a
confirmation gate*. **That maps directly onto developer complaint #2 ("AI makes unnecessary
changes").**

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

`0 unclassified`, despite ~34% of fleek-api commits lacking conventional prefixes — the
classifier held up better than predicted.

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

Default is `sonnet`/`effort=high`. **Contested — do not treat as settled.**

Chosen from a 10-session run (haiku 9/10, sonnet 2/10, opus 2/10). That sample cannot support
the conclusion. A 37-session run came back haiku 18 / sonnet 17 / opus 9 — haiku and sonnet at
effectively the same rate, which the original rationale does not predict.

In that larger run **opus/medium was the clear precision leader**: 8 distinct issues from 9
findings (89%) vs sonnet's 8 from 17 (47%). Sonnet has better recall. Sonnet kept for now
because much of its noise traced to the prompt contamination since removed, so its distinct-yield
should improve without a model change.

**All cross-run model comparisons are soft** until the corpora are re-run on the fixed engine.

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

1. ~~Stop leaking heuristic names into the Tier 2 prompt~~ — **done**
2. ~~Delete the routing-rule worked example~~ — **done**
3. **Raise E's threshold** or normalise against each session's own edit distribution (backend needs ~15–20, not 4)
4. **Fix A's adjacency bug** — non-consecutive duplicates currently invisible
5. **Add 2-of-3 model agreement as a confidence tier** — free, and it separates good findings cleanly
6. **Re-run all four corpora on the fixed engine** — current cross-run numbers are not comparable
7. **Add a capability/access-probing category** — two independent recall audits surfaced it
   (*"what do you need to open"*, *"the other session hanged"*, `[Request interrupted by user]`).
   It is the only friction class whose fix is a **tooling change rather than another rule doc**.

### Explicitly too thin to conclude

- Whether Yash's better yield is the tool or the developer (37 candidates vs Yugal's 11 in the same window)
- The capability-probing heuristic (n=1 per developer)
- True recall — the audit only ever samples *non*-candidates, i.e. short sessions where there is little to find, judged by the same model class as Tier 2
- **Whether any finding is actionable to a reviewer.** Nothing has gone through `promote-feedback` yet. *"A model wrote a plausible rule candidate"* is not *"a CODEOWNER merged it."* **This is the calibration that actually matters and none of the four runs touch it.**
