# Harness handover — the repeat-mistake ledgers

Two audits, one per repo, produced by mining six months of real pull-request history for
mistakes that **recur**. Same methodology both sides, so the two are directly comparable.

| Repo | Audit | Scope |
|---|---|---|
| Backend | [`fleek-api.md`](fleek-api.md) | Six months of `fleek-api` PRs, ranked repeat mistakes mapped to concrete harness fixes |
| Frontend | [`fleek-monorepo.md`](fleek-monorepo.md) | 933 PRs over six months plus a 150-PR pre/post baseline; 23 recurring defect patterns |

Both are **AI-1b Wave 2** under the Tech Velocity Initiative. The frontend audit is tracked in
Linear as [AIE-327](https://linear.app/fleekapp/issue/AIE-327).

## What these are for

Each pattern in these ledgers is a mistake that happened **more than once**, with the supporting
PRs cited, and a proposed harness change — a rule, a lint, a skill, or a gate — that would stop
it happening a third time. They are meant to be worked through, not read once.

The frontend audit also measures something uncomfortable and worth not losing: **two out of three
AI-review findings rated Critical or Major merged unaddressed**. Finding defects was never the
bottleneck; acting on them was.

## Source of truth

Both live in Flotion and are mirrored here so the analysis survives independently of it:

- [fleek-api harness improvement](https://os.joinfleek.com/tools/flotion/d/fleek-api-harness-improvement)
- [fleek-monorepo harness improvement](https://os.joinfleek.com/tools/flotion/d/fleek-monorepo-harness-improvement)

If a Flotion doc moves ahead, re-sync the mirror rather than editing the copy here.

## What is deliberately not here

The **Hone** calibration work — the local tool that reads a developer's own Claude Code session
history to find harness friction — lives on the `feat/hone` branch, not on `master`. That is a
separate line of work with a separate and much less settled outcome; see
`docs/hone-calibration/CONSOLIDATED.md` on that branch.

These ledgers stand on their own: they were derived from merged pull requests, not from session
transcripts, and none of their findings depend on Hone working.
