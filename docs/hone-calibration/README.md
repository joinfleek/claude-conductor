# Hone calibration — consolidated findings

Everything learned from building Hone (Fleek's AI-1, Tech Velocity Initiative Pillar 2) and
running it against six developers' real Claude Code session history, 2026-08-19 → 2026-08-26.

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

## 6. What the seven runs actually showed

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
| [Abhishek](developer-runs/07-abhishek-fleek-monorepo.md) | fleek-monorepo | 114 / 145 (79%) | *Tier 2 lost to time cap* | | | — |
| [Aarushi](developer-runs/04-aarushi-fleek-api.md) | fleek-api | 91 / 104 (87.5%) | *Tier 2 never completed* | | | — |

**Yield improved sharply with corpus size.** Yugal's run produced nothing actionable; Yash's
produced 8 genuinely distinct, specific issues. The early "Hone isn't working" read was drawn
from a 10-session sample — far too small (a 95% CI on 2/10 spans roughly 3–56%).

**Distinct-yield is the metric that responded to the fix, and it responded hard.** Pre-cutoff:
0%, 29%, 47%, 12%. Post-cutoff: 73% and 100%. Yash's two runs are the controlled comparison —
same developer, same repo, same window, engine the only variable — and the delegation cluster went
**9 → 0**.

**Tier 1 does not filter.** 79–91% flag rates across every corpus measured. C alone fires on ~95%
of candidates. The OR-gate over broad heuristics passes nearly everything through, so Tier 2 does
all the discrimination and pays per call for it. Adding E/F/G did not change this: Abhishek's
79% is the *lowest* rate recorded and still passes four sessions in five.

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

Two different innocent explanations — plan authoring on the frontend, migration work on the
backend — and a single global threshold separates neither. **The fix is a file-kind carve-out,
not a bigger number.** F, at 5/104 and 7/36, remains the most selective new heuristic.

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

Sonnet flags 42% of one developer's candidates and 6% of another's. Haiku does the reverse. Same
code, same repo, same window, contamination gone.

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
4. **Ship the secret-in-transcript hook** — §7. Best-evidenced finding, independent of everything else
5. **Make `arc-builder.mjs` refuse to run without `gh` auth** — it currently reports
   `inactive-no-pr` for every arc when auth fails, which is a *plausible false answer*, not an
   error (run 7). Cheapest fix with the worst current failure mode
6. **Give E a file-kind carve-out** — plan/ERD docs dominate its top hits on two frontend corpora.
   A higher threshold alone does not fix this (§6)
7. **Surface E's anchor `detail` in `pilot-run.mjs`'s report** — the file and edit count exist in
   the anchor objects and never reach the report; every developer has had to dig them out of
   arc-builder (run 5)
8. **Investigate Tier 2 discarding the heaviest-rework sessions** — all three models returned
   "no finding" on three sessions where all seven heuristics fired (run 5). E finds them; Tier 2
   throws them away. Likely an anchor-selection problem — §9's correction-proximity design was
   built for exactly this and is still unbuilt
9. **Fix A's adjacency bug** — non-consecutive duplicates currently invisible
10. **Add 2-of-3 model agreement as a confidence *label*** — free, but it keeps ~9% of findings,
    so do not make it a gate (§6)
11. **Add a capability/access-probing category** — three independent recall audits surfaced
    adjacent classes (*"what do you need to open"*, *"the other session hanged"*,
    `[Request interrupted by user]`, husky pre-push rejections). It is the only friction class
    whose fix is a **tooling change rather than another rule doc**. **Prerequisite:** separate
    *harness caused rework* from *policy gate fired as designed* (run 7) — otherwise widening
    the patterns manufactures findings out of guardrails working correctly
12. **Re-run the pre-cutoff corpora on the fixed engine** — Yugal, Lenvin and Abhishek's Tier 2
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
