# Run 3 — Yashvardhan Pandey · fleek-monorepo · 2026-08-24

Largest corpus of the exercise and **the run that produced genuinely useful findings**. Engine
state: A–D, **Tier 2 prompt still contaminated** (fixed later the same day, partly *because* of
what this run revealed).

Evaluated by a dedicated Opus reviewer against the full 47KB report; its analysis overturned
several standing conclusions.

## Commands

```bash
node engine/tier2-compare.mjs     --repo <fleek-monorepo> --days 30
node engine/tier1-recall-audit.mjs --repo <fleek-monorepo> --days 30
```

## Tier 2 comparison

- Tier 1 candidates: **37**
- haiku **18** · sonnet(high) **17** · opus(medium) **9** (no-finding: 19 / 20 / 28)

### Sonnet's 17 findings → ~8 genuinely distinct

**9 of 17 were "frontier model doing mechanical legwork instead of delegating"** — one issue
restated nine ways (sessions `c3230900`, `754d3fb3`, `2afbae0f`, `253546a4`, `a838040c`,
`f5420a2f`, `9edca11b`, `155bdc2d`, `785f7dbe`).

The other distinct issues — **the real output of this whole exercise**:

| # | Finding | Sessions |
|---|---|---|
| 1 | **BigQuery project-ID constraint isn't structurally enforced** | `e1cf4897`, `76665418`, `166565f4`, `fc8e4806` |
| 2 | No verify-first posture when handed batched findings with file paths/line numbers | `54ac394c` |
| 3 | Committed + pushed without confirming changeset scope; placeholders bundled with the fix | `0add2e14` |
| 4 | Asserted non-existent feature state as fact in an ERD | `f7d92f99` |
| 5 | Unilaterally marked a tracking item "fine to skip" instead of asking | `ad943b40` |
| 6 | Narrated curl diagnostics as manual steps instead of just running them | `320d67c2` |
| 7 | Used `--no-verify` to bypass a failing pre-commit gate without asking | `be5782ec` |

Items 3, 5 and 7 share a theme — **a consequential action or scope cut taken without a
confirmation gate**. This maps directly onto developer complaint #2.

**Finding 1 is the strongest result in the corpus.** It recurred across four sessions and all
three models independently proposed the same fix: a `PreToolUse` hook on the BigQuery MCP tools.
Session `76665418`'s framing:

> the skill has accumulated `STOP`/`MANDATORY`/`NEVER` prose, which is *"the accumulated artifact
> of past corrections — each emphatic clause represents a previously violated constraint now
> being re-stated with more force."*

## Tier 1 recall audit

- Non-candidate sessions checked: **17** · flagged as possible misses: **1**
- Session `de2780f9`, medium confidence, category `new-category`
- Exact phrases: `"what do you need to open"`, `"can you access this"`

Three successive prompts trying to get Claude to reach a URL it couldn't. **Capability/access
probing** — the developer isn't correcting output, they're discovering a tool limitation by
iteration. No heuristic covers it, and no amount of additional correction regexes would.

## What the Opus review overturned

**Heuristic co-occurrence ≠ finding attribution.** Yash reported A/B fired on 11 of sonnet's 17,
concluding *"the majority traces back to a real human correction signal."* Classifying the
findings by **content** showed otherwise:

| | Routing finding | Non-routing finding |
|---|---|---|
| A or B fired (11) | **5** | 6 |
| C/D only (6) | 4 | **2** |

All 5 A/B-fired routing findings explicitly say *"Inferred: No explicit correction is visible"*.

**Damning inverse:** the cleanest correction in the whole corpus — `0add2e14`, *"I meant the
fixes not the placeholder changes"* — was **C/D-only. B did not fire on it.**

**Precision per Tier-2 call toward a non-routing finding:** A/B sessions **25%**, C/D-only
sessions **15%**. A/B are *more* precise than C/D — the opposite of the standing conclusion.

**Heuristic fire rates across the 37:** A = 6 (16%) · B = 21 (57%) · C = **35 (95%)** · D = 21 (57%).

**Opus/medium was the precision leader:** 8 distinct from 9 findings (89%) vs sonnet's 8 from 17
(47%), and it surfaced two grounded issues sonnet missed entirely (`2afbae0f`, `54ac394c`).

**Cross-model agreement tracks quality almost perfectly.** Every high-value finding was found by
2–3 models; every delegation restatement by exactly one.
