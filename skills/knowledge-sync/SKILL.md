---
name: knowledge-sync
description: Distributed persistent memory — sync the knowledge layer (auto-memory files, ~/.claude/rules, CLAUDE.md) across machines via a private git remote, with git as the conflict-resolution engine. Use when the user says "sync my memory", "pull my knowledge on this machine", "share memory across machines", or after substantial memory/rules changes worth propagating.
---

# Knowledge Sync

Memory that lives on one laptop dies with it. This skill turns `~/.claude`'s knowledge surfaces (auto-memory dirs, `rules/`, global `CLAUDE.md` — nothing else, enforced by gitignore allowlist) into a git repo synced to a private remote. Conflicts use git's native machinery: rebase pulls, conflict markers, human/agent review — which published memory frameworks have not verifiably improved on.

## Usage

```bash
bash <skill-dir>/sync.sh init git@github.com:<you>/claude-knowledge.git   # once per machine
bash <skill-dir>/sync.sh status   # what changed locally
bash <skill-dir>/sync.sh sync     # commit → pull --rebase → push
```

- The remote must be a **private** repo — memory files contain project details.
- On conflict, sync stops with markers in place: resolve semantically (usually union both facts, dedupe), `git -C ~/.claude rebase --continue`, then `sync.sh sync` again.
- Knowledge bundles (e.g. OKF dirs) that live in their own repos are deliberately out of scope — sync those with their own remotes.
- Good cadence: run `sync` after a memory-consolidation pass, or schedule it alongside your other automations.

## When to reach for it

- Setting up a second machine ("pull my knowledge here": init with the same remote, then sync).
- After writing several memories/rules worth having everywhere.
- Before archiving/wiping a machine.
