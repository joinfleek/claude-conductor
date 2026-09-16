# Run 1 — Yugal · fleek-monorepo · 2026-08-21

First calibration run. Engine state: heuristics A–D only, **Tier 2 prompt contaminated**
(see [README §4](../README.md)). Treat all numbers as soft.

## Command

```bash
node engine/tier2-compare.mjs --repo <fleek-monorepo> --days 30
```

## Results

- Sessions scanned: **11** · Tier 1 candidates: **10** (91% flag rate)
- haiku **9/10** · sonnet(high) **2/10** · opus(medium) **2/10**

Sonnet's 2 findings:

| Session | Finding |
|---|---|
| `ac2150b8` | High-effort Sonnet did direct multi-tool CI/config archaeology itself |
| `3eea844d` | Assistant suggested pasting a live API key into the chat transcript |

All three models converged on `3eea844d` — the strongest cross-model agreement in the corpus.

## What this run got wrong

**The 91% flag rate was the first sign Tier 1 does not filter**, but it was read at the time as
"Tier 1 is permissive by design" rather than "Tier 1 is not a gate."

**The sonnet 2/10 number drove the model default for the next three days** and could not support
that weight. A 95% CI on 2/10 spans roughly 3–56%.

**The most important observation, only understood later:** the two heaviest-rework sessions
produced **zero** findings, while two zero-edit analysis sessions produced findings — exactly
backwards from what the tool was built for.

| Session | Human turns | Max edits to one file | Sonnet finding |
|---|---|---|---|
| `fc5880b8` | 288 | 49 | **none** |
| `f08ca383` | 85 | 26 | **none** |
| `ac2150b8` | 5 | 0 | ✓ |
| `3eea844d` | 6 | 0 | ✓ |

This drove the E/F/G work — though the follow-up (README §9) showed the inference itself was
partly wrong: the 49-edit file was a scratch HTML page outside the repo, and the top in-repo
files in both sessions were tracker/plan docs, where repeated edits are normal bookkeeping.

## Post-merge rework

Arc builder run on this repo returned **0 rework** on both arcs examined. Flagged as suspicious
at the time; Aarushi's run later confirmed the suspicion was right — see
[run 04](04-aarushi-fleek-api.md).
