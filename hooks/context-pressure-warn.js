#!/usr/bin/env node
// Context-pressure warning hook (PreToolUse: Edit|Write).
// Reads the session transcript's latest usage record, sums real in-context tokens
// (input + cache_read + cache_creation), and warns once per threshold crossing
// against the model's true window (1M default; 200k for Haiku).
// Warn-only: always exits 0 and never blocks the tool call.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const THRESHOLDS = [0.5, 0.75, 0.9];

function readStdin() {
    try {
        return fs.readFileSync(0, 'utf8');
    } catch {
        return '';
    }
}

function latestUsage(transcriptPath) {
    // Tail-read the JSONL transcript; scan backwards for the last usage record.
    let data;
    try {
        const { size } = fs.statSync(transcriptPath);
        const start = Math.max(0, size - 512 * 1024);
        const fd = fs.openSync(transcriptPath, 'r');
        const buf = Buffer.alloc(size - start);
        fs.readSync(fd, buf, 0, buf.length, start);
        fs.closeSync(fd);
        data = buf.toString('utf8');
    } catch {
        return null;
    }
    const lines = data.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line.includes('"usage"')) continue;
        try {
            const rec = JSON.parse(line);
            const u = rec?.message?.usage || rec?.usage;
            if (u && typeof u.input_tokens === 'number') {
                return {
                    tokens:
                        (u.input_tokens || 0) +
                        (u.cache_read_input_tokens || 0) +
                        (u.cache_creation_input_tokens || 0),
                    model: rec?.message?.model || '',
                };
            }
        } catch {
            // partial/foreign line — keep scanning
        }
    }
    return null;
}

function windowFor(model) {
    return /haiku/i.test(model) ? 200_000 : 1_000_000;
}

function main() {
    let payload;
    try {
        payload = JSON.parse(readStdin());
    } catch {
        process.exit(0);
    }
    const transcript = payload.transcript_path;
    const sessionId = payload.session_id || 'unknown';
    if (!transcript || !fs.existsSync(transcript)) process.exit(0);

    const usage = latestUsage(transcript);
    if (!usage) process.exit(0);

    const win = windowFor(usage.model);
    const fill = usage.tokens / win;
    const crossed = THRESHOLDS.filter((t) => fill >= t);
    if (!crossed.length) process.exit(0);
    const level = crossed[crossed.length - 1];

    // Warn once per threshold per session.
    const stateFile = path.join(os.tmpdir(), `ctx-warn-${sessionId}`);
    let last = 0;
    try {
        last = parseFloat(fs.readFileSync(stateFile, 'utf8')) || 0;
    } catch {}
    if (level <= last) process.exit(0);
    try {
        fs.writeFileSync(stateFile, String(level));
    } catch {}

    const pct = Math.round(fill * 100);
    const tok = Math.round(usage.tokens / 1000);
    const step =
        level >= 0.9
            ? 'write a handoff doc now (/handoff) or fork the session'
            : level >= 0.75
              ? 'plan /compact at the next task boundary'
              : 'cheapest next step: /compact after the current task';
    console.error(
        `[context-pressure] ~${tok}k tokens in context (~${pct}% of ${win / 1000}k window) — ${step}.`,
    );
    process.exit(0);
}

main();
