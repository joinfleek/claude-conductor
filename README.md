# claude-conductor

Frontier-model budget discipline for Claude Code. Born from a simple observation: if your main loop runs on a frontier model (Opus, Fable), every token it spends on legwork is waste — and everything it learns dies with the session unless something reminds it to write things down.

## What it installs

**Hooks** (active immediately, all sessions):

- `model-routing-context` (SessionStart) — injects a delegation ladder: spawned agents run at the lowest capable tier (haiku → sonnet → opus-high), the main loop keeps orchestration, final synthesis, and strategy, and subagent prompts stay narrow and self-contained so your strategic context never leaks into worker prompts.
- `memory-nudge` (UserPromptSubmit) — every 12th prompt (configurable via `CONDUCTOR_NUDGE_EVERY`), nudges the session to persist durable knowledge — facts to memory, 5+ tool-call procedures as draft skills. Hermes-agent-style agent-curated write-back, no daemon required.

- `claude-md-size-check` (SessionStart) — silent until always-loaded CLAUDE.md content crosses a size threshold (`CONDUCTOR_CLAUDEMD_LIMIT`, default 150k chars); only then suggests the pointer restructure. Chunking small CLAUDE.mds is counterproductive — inline is cheaper below the threshold.
- `post-task-reflect` (Stop) — when a turn ends having used ≥`CONDUCTOR_REFLECT_MIN_TOOLS` tool calls (default 8), flags the session; the very next prompt gets a one-time reflection reminder: draft the procedure as a skill, or patch the existing skill/memory the task proved wrong. Immediate Hermes-style reflection, not batch.
- `conductor-doctor` (SessionStart) — self-watcher that only speaks up on misbehavior: fast checks over the plugin's own moving parts (hook references, skill frontmatters, session-index integrity, node runtime). Silent while healthy; on failure it upserts an OPEN entry in `~/.claude/conductor-report.md` and writes the SAME entry back to RESOLVED once the problem clears — a self-maintaining bug report, no duplicates. **GitHub mirroring (optional):** set `CONDUCTOR_ISSUE_REPO=owner/repo` (or pass as the hook's second arg) and each new failure opens one GitHub issue, linked in the report entry; recovery closes that same issue with a comment. Requires `gh` authenticated; all GitHub calls are best-effort and never break the health check.

**Self-heal pattern** (not bundled — needs your scheduler): pair the doctor with a cron/LaunchAgent that exits instantly unless the report has `[OPEN]` entries, and otherwise spawns a headless worker-model session to investigate, fix locally, and comment progress on the linked issue. The doctor keeps sole authority to close issues (a check passing is the only definition of fixed). This makes the system self-improving precisely when — and only when — something misbehaves.

**Skills** (invoked on demand):

- `session-recall` — on-demand episodic memory: an incremental SQLite FTS5 index over all past session transcripts (`search.py`, stdlib-only), searchable mid-task with ranked snippets and resume pointers. ~200 sessions index in seconds; auto-reindexes before each search.

- `model-router` — data-driven tier selection: maintains `~/.claude/routing-journal.md` (one row per delegation outcome), routes new tasks by accumulated evidence instead of static defaults, and records outcomes after each run.
- `persist-everywhere` — "add this to the brain / memory / claude.md / everywhere" writes a fact to every knowledge surface in one pass: one canonical copy, condensed pointers elsewhere, dedupe-first.
- `slim-claude-md` — restructures an oversized CLAUDE.md into a lean pointer index + on-demand `rules/` detail files, keeping hard behavioral constraints inline so they can't be bypassed by lazy loading. Threshold-gated via the size-check hook, not a blanket rule.

## Install

From the GitHub repo (works while the repo is private, as long as you have access — the CLI clones over SSH or your existing git credentials):

```bash
claude plugin marketplace add shubhamparashar/claude-conductor
claude plugin install claude-conductor@claude-conductor-marketplace
```

Or the same via `/plugin marketplace add` + `/plugin install` inside a session. From a local clone, use `claude plugin marketplace add /path/to/claude-conductor`.

**Auto-updates on a private repo:** background marketplace refresh runs without git credential helpers, so set `GITHUB_TOKEN` (or `GH_TOKEN`) in your environment to get silent updates; manual `claude plugin marketplace update` uses your normal git credentials either way.

**Team lockdown (optional):** to pin an org to approved marketplaces only, deploy [docs/team-managed-settings.example.json](docs/team-managed-settings.example.json) as managed settings (`/Library/Application Support/ClaudeCode/managed-settings.json` on macOS) — `strictKnownMarketplaces` then rejects any other marketplace add.

**If you previously installed the hooks/skills standalone** (copied into `~/.claude/hooks` + `~/.claude/skills` and wired in `settings.json`): remove those entries before enabling the plugin, or every hook fires twice per session.

## Design notes

- The routing ladder was calibrated empirically: in a 102-agent research run, haiku handled 100% of search/fetch/extract cleanly, sonnet handled adversarial verification well — and sonnet failed cross-agent synthesis, which is why synthesis stays in the main loop.
- The nudge is deliberately low-frequency and self-suppressing ("if nothing durable emerged, continue without comment") — a reminder cadence, not a chore.
- `slim-claude-md` exists because CLAUDE.md grows monotonically; the two-layer split (binding one-liners inline, detail on demand) is the only version of lazy loading that doesn't break prohibition-style rules.
- Hook stdout is deterministic by design: SessionStart context is byte-identical across sessions (no timestamps, counters, or randomness), so the conversation prefix stays prompt-cache-hot (cache reads bill at 0.1x input price). Dates and mutable state go to files (`conductor-report.md`), never into emitted context. Keep this invariant when adding hooks.
