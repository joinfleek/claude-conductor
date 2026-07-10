#!/usr/bin/env node
// SubagentStop: append a PENDING row per completed subagent to
// ~/.claude/routing-journal-pending.md — model, task description, token spend.
// Rows carry no outcome judgment; the model-router skill promotes them into
// ~/.claude/routing-journal.md with an honest outcome, or discards them.
// Silent, best-effort: never blocks the session on any error.
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PENDING = join(homedir(), '.claude', 'routing-journal-pending.md');
const SEEN = join(homedir(), '.claude', '.delegation-journal-seen');

try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const dir = join(
        input.transcript_path?.replace(/\.jsonl$/, '') || '',
        'subagents'
    );
    if (!existsSync(dir)) process.exit(0);

    const seen = new Set(existsSync(SEEN) ? readFileSync(SEEN, 'utf8').split('\n') : []);
    const rows = [];
    for (const f of readdirSync(dir)) {
        if (!f.endsWith('.meta.json') || seen.has(f)) continue;
        seen.add(f);
        let meta = {};
        try { meta = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch {}
        const jsonl = join(dir, f.replace('.meta.json', '.jsonl'));
        let model = '?', outTokens = 0;
        try {
            for (const line of readFileSync(jsonl, 'utf8').split('\n')) {
                const mm = line.match(/"model":"([^"]+)"/);
                if (mm) model = mm[1];
                const um = line.match(/"output_tokens":(\d+)/);
                if (um) outTokens += parseInt(um[1], 10);
            }
        } catch {}
        const date = (input.ts || new Date().toISOString()).slice(0, 10);
        const desc = (meta.description || meta.agentType || 'subagent').replace(/\|/g, '/').slice(0, 80);
        rows.push(`| ${date} | ${desc} | ${model} | 1 | PENDING (~${outTokens} out-tok) | auto-captured; judge & promote via model-router |`);
    }
    if (rows.length) {
        if (!existsSync(PENDING)) {
            appendFileSync(PENDING,
                '# Pending delegation rows (auto-captured by delegation-journal hook)\n' +
                'Promote honest outcomes into routing-journal.md via the model-router skill, then delete the row.\n\n' +
                '| date | task | model | n | outcome | note |\n|---|---|---|---|---|---|\n');
        }
        appendFileSync(PENDING, rows.join('\n') + '\n');
        writeFileSync(SEEN, [...seen].join('\n'));
    }
} catch {}
