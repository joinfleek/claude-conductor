# CLAUDE.md — claude-conductor @ Fleek (Tech Velocity Initiative fork)

This is Fleek's fork of [shubhamparashar/claude-conductor](https://github.com/shubhamparashar/claude-conductor)
(`origin` = `joinfleek/claude-conductor`, `upstream` = Shubham's original — pull from upstream
to get his updates). Forked 2026-08-13 to actively develop/adapt it as the technical seed of
**AI-1: Local Harness-Improver Tooling**, an action item under Fleek engineering's Tech
Velocity Initiative (owner: Yugal Bagul, Senior EM).

## Why this fork exists

Tech Velocity Initiative's Pillar 2 (Coding Harness) wants a tool that captures developer
friction during active work and turns it into harness improvements — **without any individual
session/conversation data ever leaving the developer's machine.** Reviewing this plugin's
README turned up that it already implements most of the mechanism needed:

- **`learn` skill** (`/learn`, developer-invoked) distills a reusable skill from what the
  session just solved, writes it to `~/.claude/skills-drafts/<name>/SKILL.md` — never directly
  into the live skills dir.
- **`skill-harvest`** (nightly automated job) does the same by re-reading the last 24h of
  session transcripts.
- **`model-router`'s GEPA-lite patch proposals** — when routing data shows an *existing* skill
  is failing, writes a targeted patch to `~/.claude/skills-drafts/patches/` instead of editing
  it directly.
- Nothing auto-promotes anywhere — a human reads the draft/patch and manually moves it into the
  live skills dir.

That's close to exactly what AI-1 needs. This fork is where that gets adapted/hardened into
the actual target design, not reinvented from scratch.

## Target design (the four hard requirements, from Fleek's `AI-1-Requirements.md`)

- **FR1 — Local, prompted suggestion.** The tool may suggest something to a developer, but
  only when explicitly prompted — never passive or always-on monitoring.
- **FR2 — Harness-improvement proposal.** Separately, it proposes a harness improvement (a
  pattern, a guideline update, a spec-template fix) as a reviewable artifact.
- **FR3 — Developer verification gate.** A human must verify/approve the proposal before it
  takes effect. No auto-merge, no auto-promote.
- **FR4 — No aggregation, no third-party destination.** Narrowed 2026-08-19 (see
  `AI-1-Requirements.md`) — the original "zero network calls, ever" line wasn't achievable
  while using Claude Code at all (every message already goes to Anthropic's API). The real
  requirement: nothing about a developer's prompting/session content gets aggregated, or sent
  anywhere beyond the developer's own already-trusted Claude Code usage on their own account.
  A headless `claude -p` call from the assessment engine, using the developer's own auth, does
  **not** violate this. A call to a *different* backend, or anything that centralizes raw
  session content across developers, **does**.

## Status: scoping is done — this is now a build (2026-08-18, Trigger 4 corrected same day)

Every open question below this line is resolved. Full architecture, rationale, and the
20-engineer scaling analysis live in
`/Users/yugalbagul/Documents/GitHub/second-brain/01_Projects/Tech-Velocity-Initiative/AI-1-Engineering-Requirements.md`
(status: In Review) — read that before writing code; this section is the condensed version.
Linear: [AIE-177](https://linear.app/fleekapp/project/tech-velocity-ai-1-local-harness-improver-354e9832da1f)
(parent, sub-issues AIE-179–190).

**Correction, same day:** a first pass reported Claude Code's `PreCompact` hook as reliable for
manual `/compact`. A second, more careful read of
[anthropics/claude-code#13572](https://github.com/anthropics/claude-code/issues/13572) — titled
"PreCompact hook not triggered when `/compact` command runs," confirmed via `/hook:status`,
marked **not planned** by Anthropic — found it's unreliable for **both** manual and
auto-compaction, not just auto as first believed. Don't build Trigger 4 around `PreCompact`. The
fix below is what's actually current.

**Resolved architecture — not `skill-harvest`'s direct-write pattern, and not synchronous
per-trigger reads either.** Findings do NOT write straight into a shared log, and triggers do
NOT read transcripts themselves. The flow is:

```
Trigger fires (commit / PR / ERD-boundary / /checkpoint / SessionStart[clear|compact])
   --> Trigger Queue (lightweight marker only: session id, transcript path, type, timestamp)
   --> UserPromptSubmit: cheap "am I due?" check (fires every prompt, any session age)
   --> if due: detached-spawn (non-blocking, see "Dispatch mechanism" below)
       --> Local Assessment Engine, per queued transcript:
           Tier 1 — on-device heuristics (regex/similarity), always runs, zero cost
           Tier 2 — only for Tier-1 candidates: headless `claude -p` call (dev's own auth,
                    cheap model e.g. Haiku), the actual judgment call
   --> Local Buffer (gitignored, per-repo, per-developer file)
   --> Digest/Batcher (fires on a CONTENT threshold since last push, not a calendar,
       with a time-ceiling safety net; dedup is an explicit step here, every time)
   --> developer approves a batch, in one pass
   --> ONE PR into the target repo's existing claude-feedback-log/ (unchanged format)
   --> existing promote-feedback skill classifies (unchanged)
   --> CODEOWNERS review, batched PR attributes the originating developer (credit, not scrutiny)
```

This directly resolves the FR1 "known tension" that used to be open here: `skill-harvest`'s
nightly-batch-without-explicit-prompt pattern is superseded, not adopted — the Digest/Batcher
*is* the prompted checkpoint, so a developer always explicitly approves before anything leaves
the Local Buffer. Nothing auto-promotes. The local sweep itself isn't a suggestion mechanism
(FR1 still governs suggestions, unchanged, and stays live/prompted) — it's purely signal
capture, so FR1's prompted-only constraint doesn't apply to it.

**Hard constraint, explicit: the sweep is local-only, never a cloud routine.** Unlike this
vault's own Slack/GitHub/wiki-ingest sync routines (which do run in Fleek's cloud infra), a
scheduled job here must never ship transcript content to any server — Fleek-owned or otherwise
— to process it. That would violate FR4 exactly as directly as a live cloud call would.

**Scheduling mechanism — finalized 2026-08-18, not open for further design discussion.** First
instinct was to run the sweep opportunistically off `SessionStart`. Wrong: `SessionStart` fires
once per process *launch* (confirmed — parallel across multiple hooks under the same event,
capped by the slowest one's timeout; this plugin's are 5s each). A developer who never restarts
the CLI — just keeps working in one long-running process across days — would never re-trigger
it, so the sweep would silently never run for that habit. `/resume` does re-fire it (`source:
"resume"`, confirmed) but that's not the only real pattern. **`UserPromptSubmit` is the right
trigger instead** — confirmed to fire on every single prompt regardless of session age (this
plugin's own `hooks/memory-nudge.mjs` already relies on exactly this). Put the "am I due?" check
there: one local timestamp-file read/compare, near-zero added latency per prompt.

**Dispatch mechanism — finalized: a detached child process, not `async: true`.** `async: true`
exists in Claude Code's hook schema, but its guarantees (does spawned work really survive after
the hook returns?) are undocumented — not something to build the whole non-blocking design on.
Instead: the `UserPromptSubmit` hook, when due, spawns a **truly OS-detached child process**
(`child_process.spawn(cmd, args, {detached: true, stdio: 'ignore'}).unref()` in Node, or
`nohup ... & disown` in shell) and exits immediately. This is a standard Unix daemonizing
pattern — the child moves into its own process group, independent of the hook's lifecycle, so
it isn't affected even if Claude Code tears down the hook's own process the instant it returns.
Not Claude-Code-specific, not undocumented — this is how `nohup`, `pm2`, and most background-job
tooling work. The hook itself does only the timestamp check + the spawn call — low
milliseconds, not "however long the sweep takes." Hooks **cannot** dispatch a genuine
Task/subagent for this (confirmed: the only subagent-capable hook type, `type: "agent"`, exists
purely for synchronous verify-and-return checks — not open-ended background work) — a detached
OS process, not a subagent, is what does the real background work.

**Residual, much smaller than before, still worth a smoke test:** whether Claude Code runs hooks
in some sandboxed environment with non-standard process teardown (e.g. killing an entire cgroup,
not just a process group) is unknown — smoke-test the detach pattern first (see "What to build
first," step 0), but treat the design itself as settled, not something to keep debating.

**Four triggers, all P0, in parallel across `fleek-api` + `fleek-monorepo`:**
1. Post-commit — extend existing Husky hooks in each repo. Queues a marker, doesn't read.
2. Post-PR-created — extend/add a GitHub Actions workflow. Queues a marker, doesn't read.
3. Post-ERD / pre-implementation — reuse `fleek-api`'s `use-case-gate-hook.sh`
   (`ExitPlanMode`-adjacent) hook point. Queues a marker, doesn't read.
4. **`/checkpoint` skill** (not a hook) — developer-invoked before compacting/clearing.
   Actually a better FR1 fit than a hook would've been (explicitly prompted). Paired with a
   `SessionStart(source: "clear"|"compact")` hook as a post-hoc safety net: it can't block
   anything and can't read the pre-clear transcript (confirmed: `SessionStart` fires strictly
   after, and exit code 2 there is cosmetic, not a gate) — but it can queue "check this
   project's session directory for a just-orphaned transcript" before Claude Code's retention
   cleanup deletes it (default 30 days, confirmed via `code.claude.com/docs/en/sessions`; the
   file does survive `/clear` on disk, just orphaned from the active session).
   - **This plugin does not currently use `SessionStart` for this purpose** —
     `hooks/hooks.json`'s existing `SessionStart` entries (`model-routing-context.mjs`,
     `claude-md-size-check.mjs`, `conductor-doctor.mjs`, `metrics-share-nudge.mjs`) are unrelated;
     add a new hook to that array rather than repurposing one of those.
   - `context-pressure-warn.js` (see `hooks/hooks.json`) is a `PreToolUse: Edit|Write` hook — a
     different mechanism entirely, and a good reference for the "read transcript usage, warn,
     always exit 0" pattern the sweep should follow, not for Trigger 4 itself.
   - **Known limit, not expected to be fixed soon:** anthropics/claude-code#13572 is marked "not
     planned" — don't design around it changing.

**Governance, resolved:** batched PRs should attribute and surface the originating developer as
a positive contribution — not build toward "who uses the harness well" tracking. This is a
design constraint on the Proposal Writer/PR template, not just a policy note.

## What to build first (P0, in this repo)

This repo (`joinfleek/claude-conductor`) is the plugin that ships the trigger hooks + local
components into `fleek-api`/`fleek-monorepo`. Build order:
0. **Smoke-test the detached-spawn pattern, before anything else.** A trivial proof-of-concept:
   a `UserPromptSubmit` hook that spawns a truly detached child process (e.g. one that writes a
   file after a short delay) and exits immediately. Confirm (a) the CLI returns control to the
   user right away, not after the delay, and (b) the file actually gets written later — i.e. the
   detached work survives after the hook itself has exited. This is a standard OS pattern, so
   this should just work — this step is a smoke test of this specific environment, not an open
   design question.
1. **Local Assessment Engine** — its core interface: takes a transcript path (+ trigger
   context), returns a structured finding or nothing. Two tiers, finalized 2026-08-19 (FR4
   narrowed to allow this — see above): **Tier 1**, on-device heuristics only (repeated/similar
   prompts, missing structural markers) — always runs, zero cost, zero network. **Tier 2**, only
   for what Tier 1 flags as a candidate — a headless `claude -p` call, developer's own auth, a
   cheap model (start with Haiku — this doesn't need frontier reasoning and runs often).
   Framework-agnostic; validate standalone before anything calls it (see `KICKOFF-PROMPT.md`).
2. **Trigger Queue** — the lightweight marker store (session id, transcript path, trigger type,
   timestamp). Decouples "a trigger fired" from "the transcript got read."
3. **Trigger 1 (post-commit) + Trigger 2 (post-PR)** as marker-writers — lowest risk, extend
   existing infrastructure (Husky, GH Actions) in the target repos, just append to the queue.
4. **Trigger 3 (post-ERD)** and **Trigger 4 (`/checkpoint` skill + `SessionStart` safety net)**
   — build alongside 1–2, not after (Yugal's explicit call: these fire often enough to not
   defer).
5. **The `UserPromptSubmit` "due?" check + detached-spawn sweep** — the check itself is a
   single cheap timestamp read; when due, it dispatches the sweep (drains the Trigger Queue,
   invokes the Local Assessment Engine per marked transcript) via the detached-spawn pattern
   smoke-tested in step 0. Do not build this on `SessionStart` — see the correction above.
6. **Local Buffer** — a small on-disk store (gitignored path inside the consuming repo) the
   sweep writes findings into.
7. **Digest/Batcher** — fires on a content threshold (N findings since last push) with a
   time-ceiling safety net, not a calendar. Runs an explicit dedup step every time it fires
   (same file/component + correction category + text-similarity — lightweight, not embeddings).
   N, the ceiling, and the exact similarity heuristic are still open (ERD §12) — don't block
   1–6 on them, but flag before wiring the Proposal Writer.
8. **Proposal Writer** — formats an approved batch into each repo's existing
   `claude-feedback-log` schema, one PR per batch, with developer attribution.

## Build-phase update: Tier 2 model changed from Haiku to Sonnet (2026-08-21)

Everywhere above still says "cheap model e.g. Haiku" for Tier 2 — that was the scoping-phase
starting assumption, reasonably made before any real data existed. It's superseded, not
retracted-as-wrong: build order and architecture are unchanged, only the model default is.

**What changed and why.** Once real Tier 1 candidates existed to test against
(`engine/tier2-compare.mjs`, built for exactly this), a 10-session comparison on
`fleek-monorepo` real history showed Haiku flagging 9/10 sessions as findings, while Sonnet
(effort=high) and Opus (effort=medium) both flagged only 2/10 — converging on the same clearest
true positive (a secret typed into a transcript). This matches what this plugin's own routing
ladder (`hooks/model-routing-context.mjs`) already says: "verification/judging" — which is what
Tier 2 actually does, not extraction — belongs at Sonnet, not Haiku. Haiku's near-universal flag
rate looked like too low a bar for something feeding a human review gate, not genuine
thoroughness, and directly risks the review-gate volume problem already flagged as the biggest
cross-cutting risk in the ERD (§9). Opus showed no quality edge over Sonnet in that comparison,
so it isn't the default either — kept available via `tier2-compare.mjs`/env override, not chosen.

**Resolved default:** `engine/tier2.mjs`'s `DEFAULT_MODEL`/`DEFAULT_EFFORT` are now `sonnet`/
`high` (overridable per-call and via `HONE_TIER2_MODEL`/`HONE_TIER2_EFFORT`).

**New rollout step, load-bearing, not optional:** before widening Hone to a new developer's
machine as part of the pilot (and before any org-wide rollout), run
`node engine/tier2-compare.mjs --repo <their-repo> --days 30` against THEIR own session
history first. One developer's comparison data (mine) is not proof this generalizes across
different prompting styles/session shapes — confirm the model choice holds, or gather evidence
it doesn't, before trusting it broadly.

## Build-phase addition: Tier 1 recall audit (2026-08-21, same day)

A real, direct concern raised the same day as the model-comparison work above: `tier2-compare.mjs`
only ever checks sessions Tier 1 already flagged — it validates Tier 2's *precision*, not Tier
1's *recall*. Tier 1's fixed heuristics (nine hand-guessed correction-language regexes among
them) are a hard ceiling on the whole pipeline: Tier 2 can only ever refine what Tier 1 already
caught, never rescue what Tier 1 silently discarded. If the fixed patterns don't cover how a
given developer actually phrases a correction, that friction is lost before Tier 2 ever runs, no
matter how good Tier 2's judgment is.

**Built in response:** `engine/tier1-recall-audit.mjs` — runs every session Tier 1 did *not*
flag through Sonnet (effort=high), shows it the exact fixed patterns/thresholds already in place
(`CORRECTION_PATTERNS` etc., now exported from `heuristics.mjs` for exactly this), and asks it to
independently judge whether real friction was missed, extracting the exact phrasing verbatim so
it can be considered as a new fixed pattern — evidence-driven widening, not more guessing. Same
posture as `tier2-compare.mjs`: never writes to the real Local Buffer, decision-support only.

Run against `fleek-monorepo`/`fleek-api`'s own 30-day history the same day it was built: only 1
non-candidate session existed in that window (the Tier 1 heuristics already have a high hit
rate on this particular dataset), so this specific run didn't surface strong evidence either
way — expected, not a validation failure. The real signal will come from a developer whose
session mix differs more.

**Rollout step, added to the same pre-widening checklist as the Tier 2 comparison:** run
`node engine/tier1-recall-audit.mjs --repo <their-repo> --days 30` alongside
`tier2-compare.mjs` before widening Hone to a new developer's machine. If it surfaces real
missed-phrase evidence, that's the trigger to actually widen `CORRECTION_PATTERNS` (or add a new
heuristic) from real data — don't just note the finding and move on.

## Feeding decisions back

This repo is where the technical work happens. Findings, design decisions, and working code
here feed back into Fleek's Tech Velocity Initiative tracking (`Action-Items.md` and the ERD in
the `second-brain` vault) — not the other way around. When you land on something concrete (a
working prototype, a resolved design question, a repo-specific integration), report it back
there.
