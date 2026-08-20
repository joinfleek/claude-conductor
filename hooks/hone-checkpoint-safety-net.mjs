#!/usr/bin/env node
// SessionStart(source: "clear"|"compact") safety net for Trigger 4. The
// primary Trigger 4 mechanism is the developer-invoked /checkpoint skill
// (explicitly prompted, the better FR1 fit); this hook only covers the case
// where a developer clears/compacts WITHOUT running /checkpoint first. It
// cannot block anything and cannot read the just-cleared transcript -
// SessionStart fires strictly after (see CLAUDE.md's "Correction, same day":
// PreCompact is unreliable for both manual and auto-compaction, marked "not
// planned" upstream - anthropics/claude-code#13572). What it CAN do: find the
// just-orphaned transcript in this project's session directory and enqueue a
// marker before Claude Code's retention cleanup (default 30 days) deletes it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { enqueueTrigger } from '../engine/queue.mjs';
import { stateDir } from '../engine/hone-paths.mjs';
import { listTranscripts } from '../engine/resolve-transcript.mjs';

const MAX_TRACKED_SESSIONS = 200;

function sweptSessionsFile(cwd) {
    return join(stateDir(cwd), 'swept-sessions.json');
}

function readSweptSessions(cwd) {
    try {
        return new Set(JSON.parse(readFileSync(sweptSessionsFile(cwd), 'utf8')));
    } catch {
        return new Set();
    }
}

function recordSweptSession(cwd, sessionId) {
    const seen = readSweptSessions(cwd);
    seen.add(sessionId);
    const trimmed = [...seen].slice(-MAX_TRACKED_SESSIONS);
    try {
        const dir = stateDir(cwd);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(sweptSessionsFile(cwd), JSON.stringify(trimmed));
    } catch {}
}

function main() {
    let input;
    try {
        input = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        process.exit(0);
    }
    const { cwd, session_id: currentSessionId, source } = input || {};
    if (!cwd || (source !== 'clear' && source !== 'compact')) process.exit(0);

    const candidates = listTranscripts(cwd).filter((c) => c.id !== currentSessionId);
    if (!candidates.length) process.exit(0);

    const swept = readSweptSessions(cwd);
    const orphaned = candidates.find((c) => !swept.has(c.id));
    if (!orphaned) process.exit(0); // most-recent orphan already queued on a prior clear/compact

    try {
        enqueueTrigger(cwd, {
            sessionId: orphaned.id,
            transcriptPath: orphaned.file,
            triggerType: 'session-start-safety-net',
            repo: basename(cwd),
            repoPath: cwd,
            timestamp: new Date().toISOString(),
        });
        recordSweptSession(cwd, orphaned.id);
    } catch {}

    process.exit(0);
}

main();
