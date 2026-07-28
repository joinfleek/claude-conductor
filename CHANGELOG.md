# Changelog

All notable changes to claude-conductor. Newest first.

## [0.7.0] - 2026-07-28

Ported from Hermes Agent v0.18.0/v0.19.0 (the two self-improvement features the nightly harvest didn't cover):

- **learn skill** (`/learn`) - on-demand skill distillation from the live session, a path, or a URL, written to `~/.claude/skills-drafts/` for review. Complements `examples/skill-harvest/`: the harvest re-reads yesterday's transcripts on a schedule, `learn` uses the context that is still in the window. Overlap check first: an existing skill covering the ground gets a patch proposal instead of a duplicate.
- **journey skill** (`/journey`) - one recency timeline across every knowledge surface (auto-memory, `rules/`, `skills/`, `skills-drafts/` + `patches/`, `goal-contracts/`, plus `CONDUCTOR_KNOWLEDGE_DIRS`), with per-kind counts. Surfaces the draft-review backlog and stale entries that no single surface makes visible. Read-only; deletions and promotions need per-file confirmation.

## [0.6.5] - 2026-07-22

- **skill-harvest example** (`examples/skill-harvest/`) - the nightly skill harvester referenced by the model-router GEPA-lite docs is now shipped: script + launchd plist template + install guide. Drafts skills from the last 24h of transcripts into `~/.claude/skills-drafts/` (human review only, nothing auto-activates) and turns FAILED/degraded routing-journal rows into patch proposals.

## [0.6.2] — 2026-07-15

- **metrics-share skill** — anonymous, consent-gated weekly sharing of delegation metrics (model × task-kind × tokens × outcome, no content/paths) as a `metrics`-labeled GitHub issue on the repo; opt-in via `~/.claude/conductor-metrics-optin`, revoke by deleting it.
- **metrics-share-nudge hook** (SessionStart) — nudges once when the last share is >7 days old; silent unless opted in. Dormant-until-triggered per growth policy.
- **delegation-journal hook** — pending rows now capture input tokens alongside output tokens, so shared metrics carry real cost signal.

## [0.6.1] — 2026-07-14

- Public-readiness pass: doctor's automation-jobs map is now configurable (`CONDUCTOR_AUTOMATION_JOBS` env or `~/.claude/conductor-jobs.json`) with a generic log-scan fallback — no hardcoded personal LaunchAgent labels; skill doc examples genericized.

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
