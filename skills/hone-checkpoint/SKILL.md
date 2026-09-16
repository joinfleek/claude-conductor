---
name: hone-checkpoint
description: Enqueue this session's transcript for AI-1's local harness-improver sweep before compacting or clearing. Use when the user says "/hone-checkpoint", "checkpoint this session for AI-1", or right before "/compact" or "/clear" on a session that did real work. This is Trigger 4 (primary) from AI-1's build - explicitly developer-prompted, the best FR1 fit of the four triggers.
---

# AI-1 Checkpoint

Enqueues a marker pointing at THIS session's transcript into the local Trigger Queue, so the
next due sweep (dispatched from a `UserPromptSubmit` hook, running fully in the background) can
run the Local Assessment Engine over it before `/compact` or `/clear` makes the transcript
harder to find. This never reads or sends the transcript itself - it only drops a pointer.

Note on naming: `/checkpoint` is already claimed by another installed plugin (gstack's
save/resume-working-state skill) on this machine. This skill is named `/hone-checkpoint` to avoid
shadowing it. If that collision doesn't apply on a given developer's machine, `checkpoint` could
be added to this skill's frontmatter as an alias - don't assume that without checking first.

## Steps

1. Get the current working directory: `pwd`. This is `repoPath`; its basename is `repo`.
2. Find this session's own transcript: the most-recently-modified `*.jsonl` file under
   `~/.claude/projects/<repoPath with every / replaced by ->/`. Its filename (minus `.jsonl`) is
   `sessionId`.
3. Enqueue the marker:
   ```bash
   node -e '
     import("'"${CLAUDE_PLUGIN_ROOT}"'/engine/queue.mjs").then(({ enqueueTrigger }) => {
       enqueueTrigger(process.argv[1], {
         sessionId: process.argv[2],
         transcriptPath: process.argv[3],
         triggerType: "checkpoint",
         repo: process.argv[4],
         repoPath: process.argv[1],
         timestamp: new Date().toISOString(),
       });
     });
   ' "$REPO_PATH" "$SESSION_ID" "$TRANSCRIPT_PATH" "$REPO_NAME"
   ```
   (substitute the four values found in steps 1-2; quote paths that contain spaces).
4. Confirm to the user in one line: "Queued for AI-1 review (session `<short-id>`) - it'll be
   read in the background on a later sweep, nothing sent anywhere yet." Then proceed with
   whatever `/compact` or `/clear` the user asked for.

Never read the transcript yourself as part of this skill - enqueueing the pointer IS the whole
job. The Assessment Engine reads it later, out of band, and only ever surfaces findings back to
this developer via `/hone-review`.
