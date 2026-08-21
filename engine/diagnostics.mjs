#!/usr/bin/env node
// Bundles Hone's local diagnostic state into one file a developer can send
// manually if asked to - never automatic, never uploaded anywhere by this
// script itself (matches FR4: no aggregation, no third-party destination).
// Includes the debug/error log plus counts/summaries of the Trigger Queue
// and Local Buffer - NOT raw transcript content or full excerpts, only
// finding titles/confidence (the same content that's headed for a PR anyway).
//
// Usage: node engine/diagnostics.mjs --repo <path> [--out <file>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { listPending } from './queue.mjs';
import { listBuffer } from './buffer.mjs';
import { logFile } from './log.mjs';
import { stateDir, reportsDir } from './hone-paths.mjs';

function readIfExists(file) {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--repo') out.repo = argv[++i];
        else if (argv[i] === '--out') out.out = argv[++i];
    }
    return out;
}

function main() {
    const { repo: repoPath, out } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error('Usage: node engine/diagnostics.mjs --repo <path> [--out <file>]');
        process.exit(1);
    }
    const repo = basename(repoPath);
    const pending = listPending(repoPath);
    const buffered = listBuffer(repoPath);

    const lines = [
        `# Hone diagnostics — ${repo}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        '_Review before sharing - nothing here is sent anywhere by this script; it only writes a local file._',
        '',
        '## State',
        `- Pending Trigger Queue markers: ${pending.length}`,
        `- Buffered findings (unreviewed): ${buffered.length}`,
    ];

    const backfillFlag = readIfExists(join(stateDir(repoPath), 'backfill-done.json'));
    lines.push(`- First-run backfill: ${backfillFlag ? 'done' : 'not yet run'}`);
    if (backfillFlag) lines.push('```json', backfillFlag.trim(), '```');

    const lastDispatch = readIfExists(join(stateDir(repoPath), 'last-dispatch.txt'));
    if (lastDispatch) {
        const ago = Math.round((Date.now() - Number(lastDispatch)) / 60000);
        lines.push(`- Last sweep dispatch: ${new Date(Number(lastDispatch)).toISOString()} (${ago} min ago)`);
    } else {
        lines.push('- Last sweep dispatch: never');
    }

    lines.push('', '## Pending markers (queued, not yet drained by a sweep)');
    if (pending.length) {
        for (const m of pending) {
            lines.push(`- ${m.triggerType} — session ${m.sessionId || '(unresolved at enqueue time)'} — queued ${m.enqueuedAt}`);
        }
    } else {
        lines.push('None.');
    }

    lines.push('', '## Buffered findings (titles + confidence only, not the full text)');
    if (buffered.length) {
        for (const f of buffered) {
            lines.push(`- [${f.confidence}] ${f.title} — session ${(f.sessionId || '').slice(0, 8)}, ${f.createdAt}${f.tier2Model ? ` (${f.tier2Model})` : ''}`);
        }
    } else {
        lines.push('None.');
    }

    lines.push('', '## Debug/error log (last 200 lines)');
    const log = readIfExists(logFile(repoPath));
    if (log) {
        const logLines = log.trim().split('\n').slice(-200);
        lines.push('```', ...logLines, '```');
    } else {
        lines.push('No log file yet — either nothing has errored, or Hone has not run in this repo.');
    }

    const report = `${lines.join('\n')}\n`;
    console.log(report);

    const dir = reportsDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const outPath = out || join(dir, `hone-diagnostics-${repo}-${stamp}.md`);
    writeFileSync(outPath, report);
    console.error(`\nDiagnostics written to ${outPath} — review before sharing; nothing here is sent anywhere automatically.`);
}

main();
