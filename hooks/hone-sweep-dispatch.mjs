#!/usr/bin/env node
// UserPromptSubmit hook (component 5, dispatch half): a cheap "am I due?"
// check that fires on every prompt regardless of session age (SessionStart
// only fires once per process launch - see CLAUDE.md for why that was
// rejected). When the Trigger Queue has pending markers and enough time has
// passed since the last dispatch, spawns a truly OS-detached sweep-worker
// child and exits immediately - the worker's lifecycle is independent of
// this hook's (see engine/sweep-worker.mjs). Always exits 0, never blocks,
// same silent-fail convention as context-pressure-warn.js.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { listPending } from '../engine/queue.mjs';
import { stateDir } from '../engine/hone-paths.mjs';
import { logEvent } from '../engine/log.mjs';

const MIN_DISPATCH_INTERVAL_MS = parseInt(process.env.HONE_MIN_DISPATCH_INTERVAL_MS || String(5 * 60 * 1000), 10);
const NUDGE_COOLDOWN_MS = parseInt(process.env.HONE_NUDGE_COOLDOWN_MS || String(30 * 60 * 1000), 10);

const __dirname = dirname(fileURLToPath(import.meta.url));

function ensureDir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readStdin() {
    try {
        return JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        return null;
    }
}

function readTimestamp(file) {
    try {
        return parseInt(readFileSync(file, 'utf8'), 10) || 0;
    } catch {
        return 0;
    }
}

function maybeDispatchSweep(repoPath, repoName) {
    let pending;
    try {
        pending = listPending(repoPath);
    } catch {
        return; // no queue yet / unreadable - nothing to sweep
    }
    if (!pending.length) return;

    const dir = stateDir(repoPath);
    ensureDir(dir);
    const dispatchFile = join(dir, 'last-dispatch.txt');
    const now = Date.now();
    if (now - readTimestamp(dispatchFile) < MIN_DISPATCH_INTERVAL_MS) return;

    writeFileSync(dispatchFile, String(now));
    const workerScript = join(__dirname, '..', 'engine', 'sweep-worker.mjs');
    const child = spawn(process.execPath, [workerScript, repoPath, repoName], {
        detached: true,
        stdio: 'ignore',
        cwd: repoPath,
    });
    child.unref();
    logEvent(repoPath, { component: 'sweep-dispatch', level: 'info', message: `sweep dispatched (${pending.length} pending marker(s))` });
}

function maybeNudgeDigestReady(repoPath) {
    const flagFile = join(stateDir(repoPath), 'digest-ready.flag');
    if (!existsSync(flagFile)) return;

    const cooldownFile = join(stateDir(repoPath), 'last-nudge.txt');
    const now = Date.now();
    if (now - readTimestamp(cooldownFile) < NUDGE_COOLDOWN_MS) return;
    writeFileSync(cooldownFile, String(now));

    let count = '';
    try {
        count = readFileSync(flagFile, 'utf8').trim();
    } catch {}
    console.log(
        `<system-reminder>AI-1: ${count || 'Several'} local harness-friction finding(s) are ready for review. ` +
            'Run /hone-review to approve or reject them before any of it leaves this machine as a PR.</system-reminder>',
    );
}

function main() {
    const payload = readStdin();
    if (!payload) process.exit(0);
    const repoPath = payload.cwd;
    if (!repoPath) process.exit(0);
    const repoName = basename(repoPath);

    try {
        maybeDispatchSweep(repoPath, repoName);
    } catch (err) {
        // never block the prompt on sweep-dispatch failure - but log it
        logEvent(repoPath, { component: 'sweep-dispatch', level: 'error', message: 'dispatch failed', detail: err?.message });
    }
    try {
        maybeNudgeDigestReady(repoPath);
    } catch (err) {
        logEvent(repoPath, { component: 'sweep-dispatch', level: 'error', message: 'digest-ready nudge failed', detail: err?.message });
    }

    process.exit(0);
}

main();
