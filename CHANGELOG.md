# Changelog

All notable changes to claude-conductor. Newest first.

## [0.6.0] — 2026-07-14

- GEPA-lite patch proposals — the nightly harvest turns FAILED/degraded routing-journal rows that implicate an existing skill into human-reviewed patch proposals under `~/.claude/skills-drafts/patches/`; skills are never edited directly. Documented in the model-router skill.
- `model-routing-context` — self-contained multi-file coding now defaults to sonnet delegation instead of the frontier main loop.
- `automation-logs` doctor check — dashboards-refresh job added to the watched-jobs list.

## [0.5.0] — 2026-07-13

- `automation-logs` doctor check — watches `~/.claude/automation/logs/`: flags an error in the newest log's last run block (per job) or a scheduled job silent for 48h+ while its LaunchAgent plist exists. Closes the blind spot where jobs failed silently for days.
- `goal-contract` skill + `goal-contract-gate` Stop hook — Hermes-style completion contracts: done-criteria + required evidence written before work starts; a one-time reminder fires if the task stops with unchecked criteria. Warn-only, fail-silent.

## [0.4.0] — 2026-07-13

- `context-pressure-warn.js` PreToolUse (Edit|Write) hook — warns at 50/75/90% of the model's real context window, once per crossing, warn-only.
- `plugin-vet` skill + `scripts/security/` — supply-chain IOC scanner (`--home`) and unicode/Trojan-Source scanner; zero-dependency, env-gated via `ECC_*` vars. Run before installing any third-party plugin.
- `hot-cold-review` skill — dual context+cold PR review with main-loop synthesis.
- `persist-everywhere` — Save/Improve/Absorb/Drop verdict gate before any write.

## [0.3.0] — 2026-07-10

- `knowledge-sync` skill — sync the knowledge layer (memory, rules, CLAUDE.md) across machines via a private git remote.
- `cost-stats` skill — per-model/project/day token+cost accounting from transcripts.
- `delegation-journal` — routing outcomes recorded per task-kind so model routing gets data-driven over time.
- `worktree-cleanup` SubagentStop hook — reap clean, fully-pushed agent worktrees.
- Growth policy: `scripts/release-check.sh` pre-release gate (hook/skill syntax, JSON manifests, `hooks.json` refs, credential scan) + README growth-policy section (one-concern-per-file, dormant-until-triggered, overlap audit, soft deprecation).

## [0.2.0] — 2026-07-10

- `facts-recall` skill — FTS5 semantic search over the distilled knowledge layer.
- conductor-doctor: double-install check + marketplace docs.

## [0.1.1] — 2026-07-10

- conductor-doctor mirrors failures to GitHub issues (one per check, auto-closed on recovery) + self-heal pattern.

## [0.1.0] — 2026-07-10

- Initial release: model-routing SessionStart hook, memory nudges, episodic session recall, self-watching doctor. 5 hooks + 5 skills.
