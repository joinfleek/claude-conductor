#!/usr/bin/env node
// Local, append-only debug/error log for diagnosing why Hone isn't behaving
// as expected (a sweep never ran, Tier 2 keeps failing, a hook errored).
// Stays entirely on the developer's machine - same gitignored root as
// everything else Hone writes (.claude/hone/logs/hone.log). Never leaves
// this machine automatically; a developer shares it explicitly if asked,
// via engine/diagnostics.mjs, matching FR4 (no aggregation, no third party).
// NEVER logs transcript/session CONTENT - only structural facts (which
// component, what kind of failure, a truncated error message).
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { honeRoot } from './hone-paths.mjs';

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB, then rotate to .1 (one rotation, not unbounded history)
const MAX_MESSAGE_LEN = 300;

function logsDir(repoPath) {
    return join(honeRoot(repoPath), 'logs');
}

export function logFile(repoPath) {
    return join(logsDir(repoPath), 'hone.log');
}

function rotateIfNeeded(repoPath) {
    const file = logFile(repoPath);
    try {
        if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, `${file}.1`);
    } catch {
        // no file yet, or rotate failed - not fatal, just keep appending
    }
}

// component: e.g. 'sweep-dispatch' | 'sweep-worker' | 'tier2' | 'checkpoint-safety-net' | 'first-run-backfill' | 'enqueue-trigger'
// level: 'error' | 'warn' | 'info'
// message/detail: short and human-readable - never transcript excerpts or prompt text
export function logEvent(repoPath, { component, level = 'info', message, sessionId = null, detail = null }) {
    try {
        const dir = logsDir(repoPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        rotateIfNeeded(repoPath);
        const entry = {
            ts: new Date().toISOString(),
            component,
            level,
            message: String(message || '').slice(0, MAX_MESSAGE_LEN),
            sessionId,
            detail: detail ? String(detail).slice(0, MAX_MESSAGE_LEN) : null,
        };
        appendFileSync(logFile(repoPath), `${JSON.stringify(entry)}\n`);
    } catch {
        // logging must never itself break the caller
    }
}
