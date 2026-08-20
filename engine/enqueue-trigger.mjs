#!/usr/bin/env node
// Trigger-writer CLI: the one thing every trigger (Husky hooks, CI, Claude
// Code hooks) calls to append a marker to the Trigger Queue. Exists because
// Triggers 1 and 2 (post-commit, post-push) run as PLAIN git hooks, entirely
// outside Claude Code - no $CLAUDE_PLUGIN_ROOT, no session_id, no stdin JSON
// payload. Trigger 3 (post-ERD, via a real Claude Code PreToolUse hook) DOES
// have that context and passes it explicitly; Triggers 1/2 don't, and the
// sweep worker resolves the best-guess transcript at drain time instead (see
// engine/resolve-transcript.mjs) - same trade-off CLAUDE.md accepts for the
// SessionStart safety net.
//
// Usage:
//   node enqueue-trigger.mjs --repo-path <path> --trigger-type <type>
//        [--session-id <id>] [--transcript-path <path>] [--ref <ref>]
//        [--dedupe-key <key>]
//
// --dedupe-key: for triggers that should fire once per real-world event, not
// once per hook invocation (Trigger 2 - "post-pr" fires once per PR's life,
// not on every push to that branch). Checked/recorded in
// .claude/hone/state/seen-triggers.json - same "seen" pattern as the
// SessionStart checkpoint safety net (engine/hone-paths.mjs stateDir).
//
// Never throws, never prints on success, always exits 0 - a trigger-queue
// write must not be able to fail a commit or push.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { enqueueTrigger } from './queue.mjs';
import { stateDir } from './hone-paths.mjs';

const MAX_TRACKED_KEYS = 500;

function seenTriggersFile(repoPath) {
    return join(stateDir(repoPath), 'seen-triggers.json');
}

function alreadySeen(repoPath, key) {
    try {
        const seen = JSON.parse(readFileSync(seenTriggersFile(repoPath), 'utf8'));
        return Array.isArray(seen) && seen.includes(key);
    } catch {
        return false;
    }
}

function recordSeen(repoPath, key) {
    let seen = [];
    try {
        seen = JSON.parse(readFileSync(seenTriggersFile(repoPath), 'utf8'));
        if (!Array.isArray(seen)) seen = [];
    } catch {}
    seen.push(key);
    const trimmed = seen.slice(-MAX_TRACKED_KEYS);
    const dir = stateDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(seenTriggersFile(repoPath), JSON.stringify(trimmed));
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i];
        if (!key?.startsWith('--')) continue;
        out[key.slice(2)] = argv[i + 1];
    }
    return out;
}

function main() {
    try {
        const args = parseArgs(process.argv.slice(2));
        const repoPath = args['repo-path'];
        const triggerType = args['trigger-type'];
        if (!repoPath || !triggerType) process.exit(0); // malformed call - fail silent, not silent-crash

        const dedupeKey = args['dedupe-key'];
        if (dedupeKey && alreadySeen(repoPath, dedupeKey)) process.exit(0);

        enqueueTrigger(repoPath, {
            sessionId: args['session-id'] || null,
            transcriptPath: args['transcript-path'] || null,
            triggerType,
            repo: basename(repoPath),
            repoPath,
            ref: args.ref || null,
            timestamp: new Date().toISOString(),
        });
        if (dedupeKey) recordSeen(repoPath, dedupeKey);
    } catch {
        // a broken Trigger Queue write must never fail the calling git hook
    }
    process.exit(0);
}

main();
