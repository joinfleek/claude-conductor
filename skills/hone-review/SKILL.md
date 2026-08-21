---
name: hone-review
description: Review AI-1's locally buffered harness-friction findings, approve or reject each one, and (on approval) open ONE PR into this repo's claude-feedback-log with developer attribution. Use when the user says "/hone-review", when a session prompt carries an "AI-1: N ... finding(s) are ready for review" system-reminder, or when the user asks what AI-1 has found. This is the developer-verification gate (FR3) - nothing from AI-1 reaches a PR without going through this skill.
---

# AI-1 Review

This is the ONLY place AI-1's local sweep findings become visible to you, and the only place
they can turn into a PR. Everything upstream (Trigger Queue, Assessment Engine, Local Buffer) is
silent background work; this skill is the prompted, human-verification gate (FR3) that
CLAUDE.md's architecture requires before anything leaves this machine.

## Steps

1. Get `repoPath` (`pwd`) and `repo` (its basename).
2. Load and dedup the buffer:
   ```bash
   node -e '
     import("'"${CLAUDE_PLUGIN_ROOT}"'/engine/buffer.mjs").then(async ({ listBuffer }) => {
       const { dedupe } = await import("'"${CLAUDE_PLUGIN_ROOT}"'/engine/digest.mjs");
       const findings = listBuffer(process.argv[1]);
       const { kept, dropped } = dedupe(findings);
       console.log(JSON.stringify({ kept, dropped: dropped.length }, null, 2));
     });
   ' "$REPO_PATH"
   ```
3. If `kept` is empty, tell the user there's nothing pending and stop.
4. Otherwise present each kept finding to the user, plainly:
   - title, confidence, what Claude did wrong, correction given (or the "Inferred:" note),
     rule candidate, and the evidence pointer (`transcriptPath` + `turnIndex`) so they can open
     the transcript themselves if they want to check the source.
   - Mention how many near-duplicates were folded into it (from `dropped`), if any.
5. Ask the user which findings to approve - all, some, or none. This is the verification gate;
   don't skip it or auto-approve even if every finding looks obviously right. Use your judgment
   on whether a quick question or the `AskUserQuestion` tool fits better given how many findings
   there are.
6. For findings the user does NOT approve: drop them from the buffer (they're discarded, not
   resurfaced next time) via `removeFindings(repoPath, [ids], 'rejected')` from
   `engine/buffer.mjs` - the third argument records a local, this-machine-only outcome event
   (`engine/analytics.mjs`) so `node engine/trends.mjs --repo <path>` can show approve/reject rates
   over time. Also drop
   everything in `dropped` whose `duplicateOf` points at an unapproved finding, same call, same
   `'rejected'` outcome.
7. For the approved set (if any):
   ```bash
   node -e '
     import("'"${CLAUDE_PLUGIN_ROOT}"'/engine/proposal-writer.mjs").then(async (pw) => {
       const touched = pw.writeToRepo(process.argv[1], process.argv[2], APPROVED_FINDINGS);
       const result = pw.openProposalPr(process.argv[1], process.argv[2], APPROVED_FINDINGS, touched);
       console.log(JSON.stringify(result));
     });
   ' "$REPO_PATH" "$REPO_NAME"
   ```
   (substitute `APPROVED_FINDINGS` with the actual approved finding objects from step 2/4 - write
   them to a temp JSON file and `import()` + `JSON.parse(readFileSync(...))` it rather than
   inlining large objects into the `-e` string). Confirm the exact repo (`fleek-api` vs
   `fleek-monorepo`) is one `engine/proposal-writer.mjs`'s `REPO_FORMATS` actually knows about
   before running this - it throws cleanly if not, but check first rather than relying on that.
8. Remove the approved findings from the buffer via `removeFindings(repoPath, [ids], 'approved')`
   now that they're committed to a PR, and report the PR URL back to the user.

## What NOT to do

- Never call `openProposalPr` without an explicit approval from this conversation's user in this
  same pass - that push/PR is real and visible to the rest of the team.
- Never silently drop a finding without telling the user it existed - even a reject should be a
  visible, counted decision, not a silent skip.
- Never edit `docs/claude-feedback-log*` by hand here - always go through
  `engine/proposal-writer.mjs` so the rendered entry format stays in sync with each repo's real
  schema.
