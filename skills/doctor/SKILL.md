---
name: doctor
description: On-demand full checkup of the conductor stack and the surrounding Claude Code setup - runs the watcher checks plus judgment checks (context cost, duplication, staleness), reports findings by severity, and applies fixes only after per-fix confirmation. Use when the user says "conductor doctor", "check my setup", "full checkup", "why is conductor degraded", or after the SessionStart watcher reports a failure.
---

# doctor - full checkup with consent-gated fixes

The SessionStart `conductor-doctor` hook is the silent watcher; this skill is
the full checkup, modeled on Claude Code's in-session `/doctor`: diagnose every
surface, tier findings by severity, propose a fix per finding, and apply a fix
only after the user confirms that specific fix. Never bundle fixes under one
approval.

## 1. Gather

Run all of these (parallel where possible), read-only:

1. `node ${CLAUDE_PLUGIN_ROOT}/hooks/conductor-doctor.mjs ${CLAUDE_PLUGIN_ROOT}` - the scripted checks (hook refs, skill frontmatter, session index, double-install, skill shadowing, node runtime, automation logs).
2. `~/.claude/conductor-report.md` - open and recently resolved entries.
3. `claude doctor` (CLI) - installation-level health. Don't re-derive what it already covers.
4. Judgment checks the scripts can't do:
   - **Context cost**: skills/plugins installed but never invoked (check the routing journal, `~/.claude/skills-drafts/`, and session history if indexed); always-loaded CLAUDE.md sizes vs the slim-claude-md threshold.
   - **Duplication**: the same skill/hook/rule present on two surfaces (personal vs plugin vs project) without a declared reason.
   - **Staleness**: installed plugin cache version vs the marketplace repo's latest release; rules or memories that name files/flags that no longer exist (spot-check, don't sweep).
   - **Config validity**: settings files parse, permission rules well-formed (no unbalanced quotes/globs), hook commands point at existing executables.

## 2. Report

One table, most severe first. Severity tiers:

- **error** - something is broken or firing wrong (missing hook script, corrupt index, double-firing hooks).
- **warn** - works but costs or risks something (shadowed skill loading twice, oversized CLAUDE.md, stale plugin cache, malformed permission rule).
- **info** - worth knowing, no action required.

Every finding carries its evidence (file:line, command output) and a one-line
proposed fix. No finding without evidence; no fix without a finding.

## 3. Fix - one confirmation per fix

For each finding the user approves, apply the fix, then **verify by re-running
the check that flagged it** - a fix isn't done until its check passes. Update
the matching `conductor-report.md` entry only via the watcher (re-run step 1;
the watcher flips entries to RESOLVED itself - never edit the report by hand).

Constraints:

- Deleting user files (personal skills, memories, backups) always needs its own
  explicit confirmation, even inside an approved fix.
- Never edit `~/.claude/settings.json` hooks that belong to other tools; flag
  them instead.
- Anything requiring auth or an interactive session (MCP OAuth, `/plugin`
  dialogs) is reported as a user action with the exact command, not attempted.
