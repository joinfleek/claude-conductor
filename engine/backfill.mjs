#!/usr/bin/env node
// First-run backfill (new component): the first time Hone is active in a
// repo, historical session friction from before install shouldn't be lost.
// Scans this repo's local session transcripts for the last N days, enqueues
// one Trigger Queue marker per transcript found (capped), and marks itself
// done - a STRICTLY one-time event per repo, never a recurring sweep. The
// already-built sweep-worker does the actual reading/assessing later,
// exactly like any other trigger's markers - this component only enqueues.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTranscripts } from './resolve-transcript.mjs';
import { enqueueTrigger } from './queue.mjs';
import { stateDir } from './hone-paths.mjs';

const DEFAULT_BACKFILL_DAYS = parseInt(process.env.HONE_BACKFILL_DAYS || '14', 10);
const DEFAULT_MAX_SESSIONS = parseInt(process.env.HONE_BACKFILL_MAX_SESSIONS || '25', 10);

function backfillDoneFile(repoPath) {
    return join(stateDir(repoPath), 'backfill-done.json');
}

export function backfillAlreadyRan(repoPath) {
    return existsSync(backfillDoneFile(repoPath));
}

function markBackfillDone(repoPath, summary) {
    const dir = stateDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(backfillDoneFile(repoPath), JSON.stringify({ ranAt: new Date().toISOString(), ...summary }, null, 2));
}

// Returns null if backfill already ran for this repo (idempotent no-op) or
// found nothing in the window; otherwise a summary of what was enqueued.
// `repo` is the repo's basename, used only for the marker's `repo` field.
export function runFirstRunBackfill(
    repoPath,
    repo,
    { excludeSessionId = null, days = DEFAULT_BACKFILL_DAYS, maxSessions = DEFAULT_MAX_SESSIONS } = {},
) {
    if (backfillAlreadyRan(repoPath)) return null;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const candidates = listTranscripts(repoPath)
        .filter((t) => t.id !== excludeSessionId)
        .filter((t) => t.mtime >= cutoff);

    const selected = candidates.slice(0, maxSessions);
    const truncated = candidates.length > maxSessions;

    for (const t of selected) {
        enqueueTrigger(repoPath, {
            sessionId: t.id,
            transcriptPath: t.file,
            triggerType: 'backfill',
            repo,
            repoPath,
            timestamp: new Date().toISOString(),
        });
    }

    const summary = { days, foundInWindow: candidates.length, enqueued: selected.length, truncated };
    markBackfillDone(repoPath, summary);
    return summary;
}
