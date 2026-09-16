#!/usr/bin/env node
// Local, append-only outcome log - answers "is Hone actually helping, day
// over day" for ONE developer on ONE repo, on their own machine. Distinct
// from engine/log.mjs (that's technical failures; this is outcome/trend
// events). Never aggregated across developers by this module - see
// engine/trends.mjs for the local reader. Cross-developer rollups are a
// separate, explicit decision (ERD §12/§9: no per-engineer tracking,
// aggregate/repo-level only, attribution as credit not scrutiny) - this
// module only ever writes to the calling developer's own repo state.
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { honeRoot } from './hone-paths.mjs';

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB, then rotate to .1

function analyticsDir(repoPath) {
    return join(honeRoot(repoPath), 'analytics');
}

export function outcomesFile(repoPath) {
    return join(analyticsDir(repoPath), 'outcomes.jsonl');
}

function rotateIfNeeded(repoPath) {
    const file = outcomesFile(repoPath);
    try {
        if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`);
    } catch {
        // no file yet, or rotate failed - not fatal
    }
}

// event: 'sweep-completed' | 'finding-created' | 'finding-approved' | 'finding-rejected'
export function recordEvent(repoPath, { event, ...fields }) {
    try {
        const dir = analyticsDir(repoPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        rotateIfNeeded(repoPath);
        const entry = { ts: new Date().toISOString(), event, ...fields };
        appendFileSync(outcomesFile(repoPath), `${JSON.stringify(entry)}\n`);
    } catch {
        // recording an outcome event must never break the caller
    }
}
