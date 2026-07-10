#!/usr/bin/env node
// SessionStart watcher: self-checks the conductor stack and maintains a
// persistent bug report at ~/.claude/conductor-report.md. Silent while
// healthy. On a failing check it upserts an OPEN entry (keyed by check id)
// and emits a reminder; when a previously-OPEN check passes again, the SAME
// entry is written back to RESOLVED — entries are updated in place, never
// duplicated. Plugin root comes from argv[2] (${CLAUDE_PLUGIN_ROOT}).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.argv[2] || join(homedir(), '.claude');
// Optional GitHub mirroring: when a repo is configured (argv[3] or env), each
// NEW failure opens one issue and recovery closes that SAME issue. Best-effort
// only — any gh failure must never break the health check itself.
const ISSUE_REPO = process.argv[3] || process.env.CONDUCTOR_ISSUE_REPO || '';
const gh = (...args) => {
    try {
        return execFileSync('gh', args, { timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch { return null; }
};
const REPORT = join(homedir(), '.claude', 'conductor-report.md');
const today = () => {
    try { return JSON.parse(readFileSync(0, 'utf8')).ts || fallbackDate(); } catch { return fallbackDate(); }
};
const fallbackDate = () => new Date().toISOString().slice(0, 10);

const failures = [];
const check = (id, fn, detail) => {
    try {
        if (!fn()) failures.push({ id, detail });
    } catch (e) {
        failures.push({ id, detail: `${detail} (${e.message})` });
    }
};

// 1. hooks.json parses and every referenced script exists
check('hooks-json', () => {
    const hj = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const cmds = Object.values(hj.hooks || {}).flat()
        .flatMap(g => g.hooks || []).map(h => h.command || '');
    return cmds.every(c => {
        const m = c.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/(\S+)/);
        return !m || existsSync(join(ROOT, m[1]));
    });
}, 'hooks.json missing, unparseable, or references a missing script');

// 2. every skill has a SKILL.md with frontmatter
check('skills', () => {
    for (const s of ['model-router', 'persist-everywhere', 'session-recall', 'slim-claude-md']) {
        const p = join(ROOT, 'skills', s, 'SKILL.md');
        if (!existsSync(p)) return false;
        if (!readFileSync(p, 'utf8').startsWith('---')) return false;
    }
    return true;
}, 'a bundled SKILL.md is missing or lost its frontmatter');

// 3. session index db, if present, has a valid SQLite header
check('session-index', () => {
    const db = join(homedir(), '.claude', 'session-index.db');
    if (!existsSync(db)) return true;
    if (statSync(db).size === 0) return false;
    const buf = readFileSync(db).subarray(0, 15).toString();
    return buf === 'SQLite format 3';
}, 'session-index.db exists but is empty or corrupted (delete it to force a rebuild)');

// 4. no double registration: when running as an installed plugin, the same
// hook scripts must not also be wired directly in settings.json (each hook
// would fire twice per event)
check('double-install', () => {
    if (!process.env.CLAUDE_PLUGIN_ROOT) return true;
    const settings = join(homedir(), '.claude', 'settings.json');
    if (!existsSync(settings)) return true;
    const cmds = Object.values(JSON.parse(readFileSync(settings, 'utf8')).hooks || {}).flat()
        .flatMap(g => g.hooks || []).map(h => h.command || '');
    const ours = ['model-routing-context.mjs', 'memory-nudge.mjs', 'claude-md-size-check.mjs', 'post-task-reflect.mjs', 'conductor-doctor.mjs'];
    return !cmds.some(c => ours.some(s => c.includes(s)) && !c.includes(process.env.CLAUDE_PLUGIN_ROOT));
}, 'conductor hooks are registered BOTH via the plugin and directly in ~/.claude/settings.json — they fire twice per event; remove the settings.json entries (plugin is canonical)');

// 5. node runtime sanity for the hook scripts
check('node-runtime', () => parseInt(process.versions.node, 10) >= 18,
    'node < 18 cannot run the conductor hooks');

// ── report write-back ──
const date = today();
let body = '';
try { body = readFileSync(REPORT, 'utf8'); } catch {}
const entries = new Map();
for (const block of body.split(/^## /m).slice(1)) {
    const m = block.match(/^\[(OPEN|RESOLVED)\] (\S+)\n?([\s\S]*)/);
    if (m) entries.set(m[2], { status: m[1], text: m[3].trim() });
}

const failedIds = new Set(failures.map(f => f.id));
let changed = false;
for (const f of failures) {
    const prev = entries.get(f.id);
    if (prev?.status === 'OPEN' && prev.text.includes(f.detail)) {
        entries.set(f.id, { status: 'OPEN', text: prev.text.replace(/last-seen: \S+/, `last-seen: ${date}`) });
    } else {
        const first = prev?.text.match(/first-seen: (\S+)/)?.[1] || date;
        let text = `${f.detail}\nfirst-seen: ${first} · last-seen: ${date}`;
        if (ISSUE_REPO) {
            const url = gh('issue', 'create', '--repo', ISSUE_REPO,
                '--title', `[conductor-doctor] ${f.id} check failing`,
                '--body', `Automated health-check failure.\n\n**Check:** ${f.id}\n**Detail:** ${f.detail}\n**First seen:** ${first}\n\nThis issue is managed by the conductor-doctor watcher: it will be closed automatically when the check passes again. The self-heal automation may comment with fix attempts.`);
            const num = url?.match(/\/issues\/(\d+)/)?.[1];
            if (num) text += `\nissue: #${num}`;
        }
        entries.set(f.id, { status: 'OPEN', text });
    }
    changed = true;
}
for (const [id, e] of entries) {
    if (e.status === 'OPEN' && !failedIds.has(id)) {
        const num = e.text.match(/issue: #(\d+)/)?.[1];
        if (num && ISSUE_REPO) {
            gh('issue', 'close', num, '--repo', ISSUE_REPO,
                '--comment', `Health check \`${id}\` passing again as of ${date} — closed automatically by conductor-doctor.`);
        }
        entries.set(id, { status: 'RESOLVED', text: `${e.text}\nresolved: ${date}` });
        changed = true;
    }
}

if (changed) {
    const out = ['# conductor watcher report', '',
        ...[...entries].map(([id, e]) => `## [${e.status}] ${id}\n${e.text}\n`)].join('\n');
    try { writeFileSync(REPORT, out); } catch {}
}

if (failures.length > 0) {
    console.log(
        `<conductor-doctor>Conductor self-check FAILED: ${failures.map(f => f.id).join(', ')}. ` +
        `Details written to ${REPORT} (entries update in place; they flip to RESOLVED automatically once fixed). ` +
        'Investigate when convenient — the rest of the plugin may be degraded until then.</conductor-doctor>'
    );
}
