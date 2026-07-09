# claude-conductor

Frontier-model budget discipline for Claude Code. Born from a simple observation: if your main loop runs on a frontier model (Opus, Fable), every token it spends on legwork is waste — and everything it learns dies with the session unless something reminds it to write things down.

## What it installs

**Hooks** (active immediately, all sessions):

- `model-routing-context` (SessionStart) — injects a delegation ladder: spawned agents run at the lowest capable tier (haiku → sonnet → opus-high), the main loop keeps orchestration, final synthesis, and strategy, and subagent prompts stay narrow and self-contained so your strategic context never leaks into worker prompts.
- `memory-nudge` (UserPromptSubmit) — every 12th prompt (configurable via `CONDUCTOR_NUDGE_EVERY`), nudges the session to persist durable knowledge — facts to memory, 5+ tool-call procedures as draft skills. Hermes-agent-style agent-curated write-back, no daemon required.

- `claude-md-size-check` (SessionStart) — silent until always-loaded CLAUDE.md content crosses a size threshold (`CONDUCTOR_CLAUDEMD_LIMIT`, default 150k chars); only then suggests the pointer restructure. Chunking small CLAUDE.mds is counterproductive — inline is cheaper below the threshold.
- `post-task-reflect` (Stop) — when a turn ends having used ≥`CONDUCTOR_REFLECT_MIN_TOOLS` tool calls (default 8), flags the session; the very next prompt gets a one-time reflection reminder: draft the procedure as a skill, or patch the existing skill/memory the task proved wrong. Immediate Hermes-style reflection, not batch.
- `conductor-doctor` (SessionStart) — self-watcher that only speaks up on misbehavior: fast checks over the plugin's own moving parts (hook references, skill frontmatters, session-index integrity, node runtime). Silent while healthy; on failure it upserts an OPEN entry in `~/.claude/conductor-report.md` and writes the SAME entry back to RESOLVED once the problem clears — a self-maintaining bug report, no duplicates.

**Skills** (invoked on demand):

- `session-recall` — on-demand episodic memory: an incremental SQLite FTS5 index over all past session transcripts (`search.py`, stdlib-only), searchable mid-task with ranked snippets and resume pointers. ~200 sessions index in seconds; auto-reindexes before each search.

- `model-router` — data-driven tier selection: maintains `~/.claude/routing-journal.md` (one row per delegation outcome), routes new tasks by accumulated evidence instead of static defaults, and records outcomes after each run.
- `persist-everywhere` — "add this to the brain / memory / claude.md / everywhere" writes a fact to every knowledge surface in one pass: one canonical copy, condensed pointers elsewhere, dedupe-first.
- `slim-claude-md` — restructures an oversized CLAUDE.md into a lean pointer index + on-demand `rules/` detail files, keeping hard behavioral constraints inline so they can't be bypassed by lazy loading. Threshold-gated via the size-check hook, not a blanket rule.

## Install

```bash
# from a local clone
/plugin marketplace add /path/to/claude-conductor
/plugin install claude-conductor@claude-conductor-marketplace
```

Or point the marketplace add at the git URL once published.

## Design notes

- The routing ladder was calibrated empirically: in a 102-agent research run, haiku handled 100% of search/fetch/extract cleanly, sonnet handled adversarial verification well — and sonnet failed cross-agent synthesis, which is why synthesis stays in the main loop.
- The nudge is deliberately low-frequency and self-suppressing ("if nothing durable emerged, continue without comment") — a reminder cadence, not a chore.
- `slim-claude-md` exists because CLAUDE.md grows monotonically; the two-layer split (binding one-liners inline, detail on demand) is the only version of lazy loading that doesn't break prohibition-style rules.
