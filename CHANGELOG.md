# Changelog

All notable changes to claude-conductor. Newest first.

## [0.8.2] - 2026-08-21

- **Fixed: repo identity now comes from the git remote, not the directory name** (`engine/repo-identity.mjs`). Every call site previously used `basename(repoPath)`, which silently breaks for any developer whose local clone directory isn't named after the repo. Found for real in the first external pilot run: a developer's `fleek-monorepo` clone lives at `.../fleek/fe-apps`, so `basename` produced `"fe-apps"` — not a key in `proposal-writer.mjs`'s `REPO_FORMATS`. The comparison/pilot tooling still worked (it only uses the name as a label), but `/hone-review` would have thrown `No claude-feedback-log format registered for repo "fe-apps"` the instant they approved a finding — i.e. the bug was invisible right up until the one step that matters. `resolveRepoName()` parses the `origin` remote (https, git@, and ssh:// URL shapes all handled) and falls back to the directory basename only when there's no usable remote. Applied across all 9 call sites in `engine/` and `hooks/`.

## [0.8.1] - 2026-08-21

- **Tier 1 heuristic D — frontier-model-no-delegation** (`engine/heuristics.mjs`) — flags a session where a frontier-tier model or high/xhigh/max effort made 10+ direct search/fetch/exploration tool calls (Bash, Grep, Read, Glob, WebFetch, WebSearch) with zero delegation (Agent/Task) anywhere in the session. Feeds routing/efficiency rule candidates into the same finding pipeline as correctness findings — matches this plugin's own documented routing ladder (`hooks/model-routing-context.mjs`, `skills/model-router`) against real session behavior instead of leaving it as policy nobody checks. Tier 2's prompt updated to recognize this as a distinct category (judged by whether the delegated-out work fit a cheaper tier, not by task success) and now receives the flagging heuristic's concrete detail string, not just its name.
- **One-shot pilot CLI** (`engine/pilot-run.mjs`) — `node engine/pilot-run.mjs --repo <path> [--days 30] [--tier2] [--learning-summary]` for running Hone on a machine today, before any plugin install or hook wiring: walks a repo's local transcripts directly for a day window and prints + writes a plain markdown report. Tier-1-only by default (free, shows candidate volume before any `claude -p` spend); `--tier2` runs the full pipeline and writes real findings to the Local Buffer.
- **Learning summary** (`engine/learning-summary.mjs`, `--learning-summary` on the pilot CLI) — a developer-facing companion report distinct from Tier 2's harness-building output: real quoted excerpts from the developer's own flagged sessions, paired with a fixed, hand-written coaching tip per pattern type. Same Tier 1 anchors Tier 2 would use, but needs no Tier 2 go-ahead and makes zero network calls — self-reflection, not harness-building.
- **Reports directory** (`engine/hone-paths.mjs`'s `reportsDir`) — pilot and learning-summary reports are now dated + timestamped (`hone-pilot-<repo>-<YYYY-MM-DDTHH-MM-SS>.md`) and land by default in `<repo>/.claude/hone/reports/`, a running local record across runs instead of scattering into whatever directory the CLI was invoked from. `fleek-api` and `fleek-monorepo`'s own `.gitignore` updated to cover `.claude/hone/` (previously only this repo's own `.gitignore` did, meaning Trigger Queue/Buffer/reports would have shown up as untracked files in either target repo).
- **Tier 2 model/effort now overridable per call** (`invokeTier2`/`assess` accept `model`/`effort`, default still `HONE_TIER2_MODEL`/`HONE_TIER2_EFFORT`) — added specifically so a comparison run can exercise multiple configs in one process. Also added `--effort` passthrough to the `claude` CLI call, which was missing entirely before this.
- **Tier 2 model comparison CLI** (`engine/tier2-compare.mjs`) — runs every Tier 1 candidate through haiku / sonnet(effort=high) / opus(effort=medium) side by side; never writes to the real Local Buffer, purely a decision-support run. Prompted by this plugin's own routing ladder (`hooks/model-routing-context.mjs`) putting "verification/judging" — which is what Tier 2 actually does — at Sonnet, not Haiku; the original "start with Haiku" call undersold the task as extraction rather than judgment.
- **Tier 2 default changed to Sonnet/high** (was Haiku) — decided from a real 10-session `tier2-compare.mjs` run: Haiku flagged 9/10 sessions as findings, Sonnet(high) and Opus(medium) both flagged only 2/10, converging on the clearest true positive (a secret typed into a transcript). Haiku's near-universal flag rate looked like too low a bar for a human review gate, not genuine thoroughness; Opus showed no quality edge over Sonnet so isn't the default either. **New rollout step:** re-run `tier2-compare.mjs` against a new developer's own session history before widening Hone to their machine — one developer's comparison isn't proof the default generalizes. See CLAUDE.md's "Build-phase update" section.
- **Debug/error log** (`engine/log.mjs`) — every previously-silent failure point (Tier 2 call errors/malformed output, a marker that couldn't be processed, hook-level exceptions) now also appends a structured, local-only line, never transcript content. `engine/diagnostics.mjs` bundles the log plus queue/buffer state into one dated report a developer can hand over on request — nothing sent anywhere automatically.
- **Local trend tracking** (`engine/analytics.mjs`, `engine/trends.mjs`) — a local, append-only outcome log records sweep/finding/approve/reject events (`sweep-worker.mjs`, `pilot-run.mjs --tier2`, and `/hone-review`'s approve/reject step all now write to it); `engine/trends.mjs` renders a day-by-day view. Deliberately per-developer, per-repo, local-only, with no cross-developer aggregation anywhere in this plugin — consistent with the ERD's explicit non-goal against per-engineer tracking (§12) and the "credit, not scrutiny" governance framing (§9).
- **Tier 1 recall audit** (`engine/tier1-recall-audit.mjs`) — a different question than `tier2-compare.mjs`: not "is Tier 2 judging well" but "is Tier 1 silently discarding real friction before Tier 2 ever sees it." Tier 1's fixed regex/threshold patterns are a hard recall ceiling on the whole pipeline — Tier 2 can only ever refine what Tier 1 flagged, never rescue what it threw away. Runs every session Tier 1 did *not* flag through Sonnet (effort=high), showing it the exact fixed patterns already in place, asking it to independently judge whether real friction was missed and extract the exact phrasing verbatim — evidence for widening the fixed patterns, not guesswork. `CORRECTION_PATTERNS`/`SIMILARITY_THRESHOLD`/`TOOL_VOLUME_THRESHOLD`/`FRONTIER_TOOLCALL_THRESHOLD` exported from `heuristics.mjs` so the audit prompt can state them transparently. Never writes to the real Local Buffer. Built in response to a direct concern: Tier 1's 9 correction-language patterns were hand-guessed, never checked against how developers actually phrase corrections.

## [0.8.0] - 2026-08-20

**Hone** — local harness-improver tooling (Fleek's AI-1, Tech Velocity Initiative Pillar 2). Turns developer friction inside a live session into a reviewed, attributed `claude-feedback-log` PR, with nothing about a developer's session ever aggregated or sent past their own already-authenticated `claude` account. Named Hone (not `AI-1` or `ai1-*`) to avoid prefix collisions on an org-wide install where the set of other installed plugins is unknown; `AI-1` remains the name of Fleek's initiative.

- **Trigger Queue** (`engine/queue.mjs`, `engine/enqueue-trigger.mjs`) — a lightweight, one-file-per-marker local store. Every trigger (commit, PR, ERD sign-off, `/hone-checkpoint`) just appends a marker and exits; nothing reads a transcript synchronously.
- **Local Assessment Engine** (`engine/assess.mjs`) — two tiers. Tier 1 is on-device heuristics (near-duplicate prompts, correction language, unreflected tool-call volume), always runs, zero cost. Tier 2 is a single `claude -p` call (developer's own auth, Haiku by default) on a redacted excerpt, only for what Tier 1 flags as a candidate.
- **`hone-sweep-dispatch` hook** (UserPromptSubmit) — the "am I due?" check plus a detached-spawn dispatch, confirmed by direct test to survive after the spawning hook process exits (child reparents to init).
- **`hone-checkpoint-safety-net` hook** (SessionStart, `clear`/`compact`) — catches sessions that compacted or cleared without an explicit checkpoint, before the transcript is orphaned past recovery.
- **`hone-first-run-backfill` hook** (SessionStart, any source) — one-time-per-repo backfill: on first run in a repo, queues session transcripts from the last `HONE_BACKFILL_DAYS` days (default 14, capped at `HONE_BACKFILL_MAX_SESSIONS`, default 25) so installing Hone doesn't lose friction that happened before install day. Idempotent (a done-flag makes every subsequent SessionStart a single-file-check no-op); truncation is surfaced, never silent.
- **Local Buffer + Digest/Batcher** (`engine/buffer.mjs`, `engine/digest.mjs`) — findings land in a gitignored, per-repo, per-developer buffer first; a content-threshold-plus-time-ceiling digest dedupes near-duplicates before ever presenting a batch.
- **Proposal Writer** (`engine/proposal-writer.mjs`) — renders an approved batch into each target repo's *existing* `claude-feedback-log` format exactly (both the `fleek-monorepo` single-file and `fleek-api` one-file-per-entry shapes), one PR per batch, developer-attributed.
- **`hone-checkpoint` / `hone-review` skills** — the developer-prompted trigger and the human-verification gate (nothing reaches a PR without explicit review here).
- **Triggers 1–3 wired into real hook points** in both `fleek-api` and `fleek-monorepo` (Husky `pre-commit`/`pre-push`, and `fleek-api`'s `use-case-gate-hook.sh`), each tested against the real, unmodified hook logic in those repos. Trigger 2 (post-PR) runs fully local — a GitHub Actions workflow can't reach the local Trigger Queue at all, so it extends the same `pre-push` hook instead, deduped to fire once per PR via `gh pr view`.
- **Fixed:** `fleek-api`'s `.claude/settings.json` pointed the `claude-conductor` marketplace at the upstream `shubhamparashar/claude-conductor` repo instead of this fork — every hook/skill in this plugin would silently never have reached that repo. Repointed to `joinfleek/claude-conductor`; the same marketplace block was added to `fleek-monorepo`'s `.claude/settings.json`, which had none.
- **CODEOWNERS** entries added in both repos scoping `.claude/rules/` and `CLAUDE.md` to each repo's ERD-designated reviewer group, with every GitHub handle cross-checked against real commit history (GitHub's noreply-commit-email format) rather than guessed from a name.

## [0.7.3] - 2026-07-29

Doctor check-coverage fixes from the first cross-repo doctor sweep:

- **skills check derives from the skills/ dir** - previously a hardcoded 7-name array covered 7/17 bundled skills; new skills are now checked automatically.
- **skill-shadow also covers the current project's `.claude/skills`** - project-level copies of bundled skills need the same declared-divergence note as personal copies (found live: two undeclared project overlays).

## [0.7.2] - 2026-07-29

Data-quality fixes for the delegation journal, found via the first 2026-W31 metrics payload (#11):

- **in_tok now sums the full in-context input** (#12) - `input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens`, matching how context-pressure-warn already measures context. Previously only the uncached marginal slice was captured, understating input by orders of magnitude.
- **agents that never got a first API response journal as `SPAWN-FAILED`** (#13) - instead of a `? / 0 / 0` PENDING row, so spawn failures are a countable failure mode and don't dilute the judgeable pending set.

## [0.7.1] - 2026-07-29

Aligned with the principles of Claude Code's in-session `/doctor` (full-surface checkup, severity tiers, consent-gated fixes):

- **doctor skill** (`/doctor` complement, invoked on demand) - full checkup of the conductor stack and surrounding setup: runs the scripted watcher checks plus judgment checks scripts can't do (context cost of unused skills/plugins, cross-surface duplication, stale plugin caches, malformed permission rules), reports findings by severity with evidence, applies fixes only after per-fix confirmation, and verifies each fix by re-running the check that flagged it. The SessionStart watcher stays the silent detector; this skill is the fixer.
- **conductor-doctor hook: skill-shadow check** - flags a personal `~/.claude/skills/<name>` that duplicates a bundled plugin skill (both descriptions load every session, invocation becomes ambiguous) unless the personal copy declares its divergence ("diverges from the plugin copy") near the top - deliberate overlays stay allowed.

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
