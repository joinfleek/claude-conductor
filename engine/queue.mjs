#!/usr/bin/env node
// Trigger Queue (component 2): a lightweight marker store, one JSON file per
// marker, decoupling "a trigger fired" from "the transcript got read". Lives
// inside the CONSUMING repo (fleek-api / fleek-monorepo), gitignored - see
// engine/hone-paths.mjs for the path convention shared with buffer.mjs.
//
// One file per marker (not an appended log) so concurrent triggers - a
// post-commit hook firing while a post-PR workflow also enqueues, or a sweep
// mid-drain - never collide on the same file. Mirrors fleek-api's own
// claude-feedback-log/ convention for the same reason.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { queueDir } from './hone-paths.mjs';

function ensureDir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// marker: { sessionId, transcriptPath, triggerType, repo, repoPath, ref?, timestamp }
export function enqueueTrigger(repoPath, marker) {
    const dir = queueDir(repoPath);
    ensureDir(dir);
    const enqueuedAt = new Date().toISOString();
    const id = randomBytes(6).toString('hex');
    const record = { id, enqueuedAt, ref: null, ...marker };
    const filename = `${enqueuedAt.replace(/[:.]/g, '-')}-${id}.json`;
    writeFileSync(join(dir, filename), JSON.stringify(record, null, 2));
    return record;
}

// Returns pending markers sorted oldest-first, each carrying `_file` (absolute
// path) so the caller can remove it once processed - not removed in bulk, so a
// crash mid-sweep just leaves the unprocessed remainder for the next due-check.
export function listPending(repoPath) {
    const dir = queueDir(repoPath);
    if (!existsSync(dir)) return [];
    const markers = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const file = join(dir, name);
        try {
            const record = JSON.parse(readFileSync(file, 'utf8'));
            markers.push({ ...record, _file: file });
        } catch {
            // corrupt/partial marker file - skip it, don't let one bad file wedge the queue
        }
    }
    markers.sort((a, b) => (a.enqueuedAt || '').localeCompare(b.enqueuedAt || ''));
    return markers;
}

export function removeMarker(marker) {
    try {
        rmSync(marker._file, { force: true });
    } catch {
        // best-effort - a missing file is already the desired end state
    }
}
