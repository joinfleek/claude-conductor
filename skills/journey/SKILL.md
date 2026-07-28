---
name: journey
description: Show what this Claude install has actually learned over time - memories, rules, skills, unreviewed drafts, goal contracts - as one recency timeline, then prune what is stale or wrong. Use when the user says "/journey", "what have you learned", "what do you know about me", "show my memory", "what's in the drafts queue", or before a memory consolidation pass.
---

# Journey

Persisted knowledge accumulates in five different places and nobody ever looks at it as a whole. This prints one timeline across all of them, so the stale entry and the draft that has been waiting three weeks are both visible.

```bash
bash <skill-dir>/journey.sh          # last 30 days
bash <skill-dir>/journey.sh 90       # last 90 days
```

Read-only. Covers `~/.claude/rules`, `~/.claude/skills`, `~/.claude/skills-drafts` (plus `patches/`), `~/.claude/goal-contracts`, and per-project auto-memory under `~/.claude/projects/*/memory/`. Set `CONDUCTOR_KNOWLEDGE_DIRS` (colon-separated, the same var `facts-recall` uses) to fold in external knowledge bundles; a bundle on a daily refresh cadence will dominate the timeline, so unset it for a signal-only view.

## What to do with the output

Report the timeline, then act on what it exposes:

- **Drafts piling up** (`kind=draft`) are the review backlog: skills harvested or `/learn`ed but never promoted. Offer to triage the oldest few - promote (`mv` into `~/.claude/skills/`), rewrite, or delete.
- **Patches under `skills-drafts/patches/`** are proposed fixes to skills that failed in practice. Older than a week means the skill is still broken.
- **A memory or rule contradicting something you learned this session** is the highest-value find. Fix the file, don't add a second one that disagrees (`persist-everywhere` handles the multi-surface write).
- **Nothing touched in months** is a candidate for deletion. Say which and why.

Never delete or promote anything without the user confirming that specific file.
