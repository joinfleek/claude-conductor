#!/usr/bin/env node
// SessionStart hook: silent until the always-loaded CLAUDE.md content crosses
// a size threshold where context cost starts to matter; only then suggest the
// slim-claude-md pointer restructure. Chunking below the threshold is waste —
// a small CLAUDE.md is cheaper inline than as pointers plus on-demand reads.
// Threshold via CONDUCTOR_CLAUDEMD_LIMIT (chars, default 150000).
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LIMIT = parseInt(process.env.CONDUCTOR_CLAUDEMD_LIMIT || '150000', 10);

let cwd = process.cwd();
try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    cwd = input.cwd || cwd;
} catch {}

const candidates = [
    join(homedir(), '.claude', 'CLAUDE.md'),
    join(cwd, 'CLAUDE.md'),
    join(cwd, '.claude', 'CLAUDE.md'),
];

const oversized = [];
let total = 0;
for (const f of candidates) {
    try {
        const size = statSync(f).size;
        total += size;
        if (size > LIMIT) oversized.push(`${f} (${Math.round(size / 1000)}k chars)`);
    } catch {}
}
if (total > LIMIT && oversized.length === 0) {
    oversized.push(`combined CLAUDE.md files (${Math.round(total / 1000)}k chars)`);
}

if (oversized.length > 0) {
    console.log(
        `<conductor-claude-md-size>CLAUDE.md content exceeds the ${Math.round(LIMIT / 1000)}k-char threshold where per-session context cost degrades performance: ${oversized.join('; ')}. ` +
        'Suggest running the slim-claude-md skill to restructure it into a pointer index (binding one-liners inline, details in rules/ read on demand). Mention this to the user once; do not act without their go-ahead.</conductor-claude-md-size>'
    );
}
