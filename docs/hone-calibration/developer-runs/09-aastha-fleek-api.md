# Run 9 — Aastha Singh · fleek-api · 2026-08-26

Third backend run, on `feat/hone @ 892e6a7` — the newest engine state of any run. All four checks
completed. She also pasted all four raw reports inline (the Slack connector couldn't attach
files), and **the raw reports contain materially more than her summary** — including the single
worst arc-builder failure found so far.

44 sessions → **35 candidates (80%)**. A 3 · B 21 · C 27 · D 24 · **E 15 · F 3 · G 11**

## The worst arc-builder output in the exercise

On `feat/buyer-profile-followups` (PR #9871), the report printed:

> _"No fix/revert commits: the follow-on activity was extension or maintenance, not defect
> repair."_

**The only post-merge commit on that arc is a revert of that exact PR.**

```
[unclassified] 4b6805f5 08-24 Revert "fix(buyer-profile): make avgOrderValue
                              platform-wide, index order.email" (#9876)  (11 files)
```

The classifier doesn't recognise `Revert "..."`, so it landed unclassified, so the rework count
read 0, so the renderer emitted a confident all-clear. **This is not a wrong number — it is an
affirmative false statement, generated because a count was zero for the wrong reason.**

The full sequence is visible across two arcs: `67c1ba19 fix(buyer-profile): …` (#9871) classified
**rework**, then `4b6805f5 Revert "fix(buyer-profile): …"` (#9876) classified **unclassified**.
The fix counted; the revert of the fix didn't.

**12 unclassified commits total**, and her diagnosis is exact — the classifier only matches
conventional-commit prefixes, so all of these were missed:

| Commit title | Should be |
|---|---|
| `Revert "fix(buyer-profile): …"` | rework |
| `fix : new route migrated to finance stack` (space before colon) | rework |
| `Fixing couple of issues with video call` | rework |
| `Feat/video call fixes` | rework or extension |

Her proposed fix: a `revert`/`fix`-anywhere-in-title fallback, which *"would move most of the 12
unclassified into rework."*

**This contradicts [run 4](04-aarushi-fleek-api.md)'s headline "0 unclassified" result**, which
[README §8](../README.md) recorded as the classifier holding up better than predicted. It did not
hold up; Aarushi's corpus just happened to contain conventionally-prefixed commits.

## She independently re-derived the hub-file problem

Her second calibration note, unprompted:

> *"Most 'extension'/'maintenance' post-merge commits on the buyer-profile and
> video_call_migration arcs are unrelated pricing/referral work that only overlap via shared hub
> files (`services/allMigrations.ts`, `sql.generated.ts`, stacks). Post-merge counts on those arcs
> mostly measure hub-file traffic, not follow-up to the AI-written code."*

This is **the same conclusion as [`fleek-api-rework-analysis.md`](../fleek-api-rework-analysis.md)**,
where 13 post-merge commits were hand-checked against `git blame` and only 5 turned out to be
genuinely introduced by the PR they were attributed to. She reached it from the opposite
direction — reading commit titles rather than blaming lines — without having seen that analysis.

Two independent derivations of the same defect. Her suggested fix (exclude known hub files, or
weight by files-in-common) is a cheaper approximation than full line-level `git blame`.

Concretely, on `feat/buyer-profile-be`: 10 "extension" commits, nearly all `feat(pricing): …`
work that touches `variant_zone_prices` and `allMigrations.ts` — nothing to do with buyer
profiles.

## The `gh` auth failure, root-caused

> ⚠️ *"First run showed all 5 arcs as `inactive-no-pr` because a stale `GITHUB_TOKEN` env var
> shadowed `gh` auth (HTTP 401). Re-ran with `env -u GITHUB_TOKEN`."*

[Run 7](07-abhishek-fleek-monorepo.md) hit this and never found the cause. She found cause and
workaround in one pass. **Second independent occurrence** — this is not a one-machine
misconfiguration, and arc-builder should refuse to run rather than silently mislabel every arc.

Her post-fix result: **5 arcs, all merged**, rework > 0 on **4 of 5** (2, 2, 1, 1, 0).

## E: the useful counter-evidence

5 of 15 E hits are ERD/docs files — the fourth independent report of E's documentation problem.

**But her top code hit is `data/chats/chat_service.ts` at 40×**, alongside `docs/erd/VIDEO_CALL_SERVICE_ERD.md`
at 41×. Also `data/order.ts` 19×, `handler/buyerProfile.ts` 17× (twice), `handler/buyerProfileLabel.ts` 13×.

This is a useful corrective. After runs 1, 7 and 8, the reading was drifting toward "E only ever
finds documentation." It doesn't — **real backend source files hit 40× too**, and a docs carve-out
would have left that hit standing. The carve-out is still right; the conclusion "E finds nothing
real" would not be.

Her biggest arc, `feat/buyer-profile-be` (PR #9776), is the most striking churn number in the
exercise: **318 edits across 56 files in 1.0 day, from 30 human turns.** Ten edits per human turn.

## Tier 2: 15 sessions · haiku 8 · sonnet 1 · opus 0

**And a caveat she raised that may invalidate the model comparison across every run.**

> *"The report says 'no finding (or Tier 2 call failed)' — it can't distinguish a judged-clean
> session from a failed call. Sonnet returning 1/15 and opus 0/15 while haiku returns 8/15 smells
> more like failures/format rejections than genuine judgments."*

**She is half right, and the half she's wrong about makes this answerable.** `engine/tier2.mjs`
already logs five distinct outcomes to `hone.log`:

| Outcome | Level | Line |
|---|---|---|
| `claude -p` invocation failed | error | `tier2.mjs:101` |
| returned no JSON object | warn | `tier2.mjs:112` |
| malformed JSON | warn | `tier2.mjs:123` |
| `isFinding: true` but a required field missing | warn | `tier2.mjs:139` |
| **`isFinding: false` — a genuine negative judgment** | info | `tier2.mjs:135` |

Only the *report renderer* collapses all five to one string. So the question is settleable from
her existing log with no re-run — asked 2026-08-26, **still pending from her.**

### ⚠️ But the log cannot answer it the way we assumed

[Sampada](08-sampada-fleek-api.md) ran the same check on her own log and found the limitation
while doing it: every Tier 2 line carries `sessionId: null` and there is **no `model` field**.
Confirmed in code (`log.mjs:37`, `tier2.mjs:104`).

So the log can say *"N of this run's calls failed"* — an aggregate verdict — but never
*"**sonnet's** calls failed"*. **On this run that is precisely the question.** haiku 8 / sonnet 1 /
opus 0 is only suspicious *per model*, and the log has no per-model dimension.

Her result came back clean (error 0, warn 0, info 28), so hers is verified. If Aastha's comes back
with a non-zero error or warn count, we will know **something** failed and still not know **which
model** — and the per-model comparison stays unresolved until `sessionId` and `model` are stamped
on each line.

**If she is right, it is the most consequential finding of the exercise**, because
[README §10](../README.md) reads per-model rate differences across nine runs as developer
variance. An alternative explanation is that the instrument was failing at different rates.
[Run 6](06-kishan-fleek-monorepo.md) is the counter-evidence: 147 calls, `hone.log` confirmed 0
errors, haiku 17 / sonnet 3. So the pattern *can* occur genuinely — but that was verified in
exactly one run out of nine.

### The one thing sonnet found is the exercise's second-most-recurring finding

> **Bypassed pre-push hook (`--no-verify`) without explicit user approval** (session `e3f7b5c9`)
> *"used `git push --no-verify` after independently reasoning the flagged file was a rebase false
> positive, with no visible user authorisation… the explanation reads as post-hoc justification."*

**Haiku flagged the same session** from a different angle ("should have detected the rebase false
positive"). Cross-model agreement on the same event.

And it recurs across developers: Yash's run-3 item 7 (`--no-verify` to bypass a failing
pre-commit gate without asking) and Lenvin's `5d6c0447`. **Three developers, both repos.** After
secrets-in-transcripts, this is the best-evidenced finding in the exercise.

### Haiku's 8 findings cluster into ~5 themes

`--no-verify` bypass · verification claims with no visible tool evidence · not reading background
task output before dependent steps (2 sessions) · reporting a problem without offering the fix ·
designing auth/ERDs without exhaustive verification.

Notably, haiku here **labels its inferences** — *"Correction (inferred): none visible"* — which it
did not do in [run 8](08-sampada-fleek-api.md), where it wrote a prescription into
`correctionGiven` as though it were a quote. So the fabrication problem is inconsistent rather
than universal, which makes the proposed mechanical check (does `correctionGiven` appear in the
transcript?) more useful, not less.

## Check 4 — and the sharpest diagnosis of Tier 1's real problem

3 non-candidates checked, **0 misses**. Her explanation of why the sample is so small is the best
statement of the Tier 1 problem anyone has produced:

> *"Only 3 sessions were eligible because Tier 1 already flags 35/44 (80%) as candidates — recall
> is basically capped by C-unreflected-volume (27/44) and D-frontier-no-delegation (24/44), which
> fire on most working sessions. **Those two look more like 'precision' tunables than recall
> risks.**"*

This explains every thin recall audit in the exercise (samples of 2, 3, 7, 10, 16, 17). **The
recall audit is structurally starved by C and D**, and no amount of running it will fix that —
the fix is upstream, in what C and D fire on. See [README §11](../README.md).

## Status

Reported 2026-08-26 13:34 IST, ~50 minutes after being asked. Four raw reports read in full.
`hone.log` question outstanding.
