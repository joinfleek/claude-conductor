# Kickoff prompt — build phase (2026-08-18, finalized)

The scoping/analysis phase (below, preserved for history) is done, and so is the design —
every open question has a decided answer. This is the prompt to paste to start the first
**build** session. No further design discussion expected before this runs on a few developers'
machines and we learn from real usage.

```
Read CLAUDE.md in this repo root first — the "Status: scoping is done — this is now a build"
section has the resolved architecture and build order, including the finalized (2026-08-18)
non-blocking sweep design. Everything above that line in CLAUDE.md is historical context (why
this fork exists, FR1-FR4), everything in that section and below is current and load-bearing.

Then read hooks/hooks.json and hooks/context-pressure-warn.js — that's the existing hook pattern
in this plugin (a PreToolUse hook reading transcript usage from stdin). Note: Trigger 4 is NOT a
PreCompact hook (retracted — see CLAUDE.md's "Correction, same day") — it's a `/checkpoint`
skill plus a SessionStart safety net. context-pressure-warn.js is still the closest local
reference for how this plugin's hooks read a transcript path and behave (warn-only, silent-fail,
always exit 0 on the happy path) — useful for the sweep's read pattern, not for Trigger 4 itself.

Start with component 0 from CLAUDE.md's "What to build first" list: the detached-spawn
mechanism. This is finalized, not open for redesign — a synchronous `UserPromptSubmit` hook that
does a cheap timestamp check and, when due, spawns a truly OS-detached child process
(`child_process.spawn(cmd, args, {detached: true, stdio: 'ignore'}).unref()` — standard Node
daemonizing pattern, not a Claude Code-specific feature) and exits immediately. The hook itself
should take low milliseconds; the detached child does the real work on its own, independent of
the hook's lifecycle. Build this as a trivial proof-of-concept first (spawn something that
writes a file after a short delay, confirm the CLI returns instantly and the file shows up
later) — smoke-test it in this specific environment before building on it, but treat the design
itself as settled, not a decision to relitigate.

Once that's confirmed working, move to component 1: the Local Assessment Engine. Also finalized,
not open for redesign — two tiers (see CLAUDE.md, FR4 narrowed 2026-08-19): Tier 1 is on-device
heuristics only (repeated/similar prompts, missing structural markers), always runs, zero cost.
Tier 2 is a headless `claude -p` call — developer's own auth, start with Haiku — but ONLY for
whatever Tier 1 flags as a candidate, not every queued transcript. Before writing it:
1. Propose its interface — what does it take in (transcript path? a trigger type/context?) and
   what does it return (shape of a "structured finding," or nothing)? Ground this in what
   `docs/claude-feedback-log/README.md`-style entries look like in fleek-api/fleek-monorepo (ask
   me for those paths if you don't have them) — the finding shape should map cleanly onto that
   schema later, even though the engine itself doesn't write there directly.
2. Propose the Tier 1 heuristics concretely — what specific checks, and what makes something a
   "candidate" worth escalating to Tier 2? Start simple; this can get smarter after real usage.
3. Propose the Tier 2 prompt — what do you actually send `claude -p` (transcript excerpt size,
   what you ask it to judge), and what output format keeps it cheap and structured (not a long
   freeform response).
4. Flag anything about this that's underspecified before you start — I'd rather resolve it now
   than rebuild after.

Then build straight through the rest of CLAUDE.md's "What to build first" order (Trigger Queue,
Triggers 1-4, the UserPromptSubmit-triggered sweep, Local Buffer, Digest/Batcher, Proposal
Writer) — the goal is a working end-to-end loop on a couple of real developers' machines, not a
perfected system. Flag genuine blockers as you hit them; don't pause for open-ended design
review on things already decided.
```

---

## Archived — scoping-phase kickoff (2026-08-13, superseded)

```
Read CLAUDE.md in this repo root first for full context — this is Fleek's fork of
claude-conductor, being adapted into AI-1 (local harness-improver tooling) for the Tech
Velocity Initiative.

Then read the README.md in this repo fully, specifically the `learn` skill
(skills/learn/SKILL.md), the skill-harvest example (examples/skill-harvest/), and the
model-router skill (skills/model-router/) — these three are the closest existing match to
the target design.

Give me:
1. A gap analysis: for each of FR1-FR4 in CLAUDE.md, does the current plugin satisfy it as-is,
   partially, or not at all — be specific about which file/mechanism you're evaluating.
2. A concrete recommendation on the "known tension" flagged in CLAUDE.md (skill-harvest's
   nightly batch job vs. FR1's prompted-only requirement) — options, not just a restatement of
   the problem.
3. A concrete recommendation on open question 3 (PR target) — what it would actually take to
   change the promote step from a local `mv` into a real Git PR, and whether that's worth doing
   vs. keeping the local-file-drafts pattern.
4. Anything in this plugin that looks over-scoped or risky to bring into a company-wide rollout
   (e.g. the `--permission-mode bypassPermissions` note in the skill-harvest README) that I
   should know about before this goes further than my own laptop.

Don't write code yet — I want the analysis first, then we'll decide what to actually build.
```
