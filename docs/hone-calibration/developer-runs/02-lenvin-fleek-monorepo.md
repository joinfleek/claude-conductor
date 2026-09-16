# Run 2 — Lenvin Gonsalves · fleek-monorepo · 2026-08-21

Second data point, requested to check whether the model choice generalised beyond one developer.
Engine state: A–D, **Tier 2 prompt still contaminated**.

Work profile: heavy Sentry / BigQuery analytics and incident investigation. This turned out to
matter — it is not a representative sample of feature-building work.

## Command

```bash
node engine/tier2-compare.mjs --repo <fleek-monorepo> --days 30
```

## Results

- Tier 1 candidates: **17**
- haiku **11** · sonnet(high) **7** · opus(medium) **3**
- All 51 `claude -p` calls succeeded — 29 explicit `isFinding: false`, 1 malformed response
  discarded, **zero call failures**

### Of sonnet's 7 findings

**5 were the same "frontier model should have delegated mechanical work to a cheaper tier"
finding, restated.** Only 2 were distinct:

| Session | Distinct finding |
|---|---|
| `5d6c0447` | PR flow ran linting when the developer wanted `--no-verify` |
| `2bfe7e8c` | Suggested a device name without running device discovery first |

**Five sessions where heuristic B fired *alone* produced zero sonnet findings.**

### Model disagreement

Opus's 3 findings were **not a subset** of sonnet's 7 — genuine disagreement about which
sessions clear the bar, not a clean strictness ordering.

## What this run drove — and what it got wrong

It produced the conclusion *"A/B produce essentially nothing; the system measures cost/routing,
not prompting quality."*

**That conclusion was overstated.** Yash's run (37 candidates) later showed A or B firing on 11
of 17 sonnet findings. The error was generalising from one developer whose work profile —
analytics and incident triage rather than feature building — was unrepresentative.

The repetition observation, however, **held and strengthened**: 5-of-7 here, 9-of-17 for Yash.
Later diagnosed as substantially caused by the prompt contamination, not by the corpus.

## Bug this run exposed

Lenvin's fleek-monorepo checkout lives at `.../fleek/fe-apps`. Hone derived repo identity from
`basename(repoPath)` → `"fe-apps"` → not a key in `proposal-writer.mjs`'s `REPO_FORMATS`.

The comparison tooling worked fine (it only uses the name as a label), but `/hone-review` would
have thrown `No claude-feedback-log format registered for repo "fe-apps"` **the instant he
approved a finding** — invisible right up to the one step that matters.

Fixed in `engine/repo-identity.mjs`: identity now comes from the git remote, not the directory
name. Handles `https://`, `git@`, and `ssh://` shapes, falls back to basename only when there is
no usable remote.
