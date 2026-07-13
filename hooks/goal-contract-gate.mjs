#!/usr/bin/env node
// Stop hook: Hermes-style goal-contract gate. If the current session has an
// ACTIVE goal contract (~/.claude/goal-contracts/*.md, written by the
// goal-contract skill) with unchecked completion criteria, drop a one-time
// flag for the next UserPromptSubmit to surface as a reminder — Stop-hook
// stdout is not shown to the model (see post-task-reflect.mjs), so the flag
// file is the only reliable channel. Never blocks; fails silent.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const CONTRACTS_DIR = join(homedir(), '.claude', 'goal-contracts');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const sid = input.session_id;
    if (!sid || !existsSync(CONTRACTS_DIR)) process.exit(0);

    const files = readdirSync(CONTRACTS_DIR).filter((f) => f.endsWith('.md'));
    if (!files.length) process.exit(0);

    // Prefer a contract tagged with this session id; otherwise fall back to
    // the newest ACTIVE contract younger than MAX_AGE_MS.
    let candidate = null;
    let candidateMtime = 0;
    for (const f of files) {
        const p = join(CONTRACTS_DIR, f);
        const text = readFileSync(p, 'utf8');
        if (!/^status:\s*ACTIVE/m.test(text)) continue;
        if (text.includes(`session_id: ${sid}`)) {
            candidate = { path: p, text };
            break;
        }
        const mtime = statSync(p).mtimeMs;
        if (Date.now() - mtime <= MAX_AGE_MS && mtime > candidateMtime) {
            candidate = { path: p, text };
            candidateMtime = mtime;
        }
    }
    if (!candidate) process.exit(0);

    const unchecked = (candidate.text.match(/^- \[ \]/gm) || []).length;
    if (unchecked === 0) process.exit(0);

    writeFileSync(join(tmpdir(), `conductor-goal-contract-${sid}`), `${candidate.path}|${unchecked}`);
} catch {
    // fail silent
}
process.exit(0);
