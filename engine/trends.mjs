#!/usr/bin/env node
// Local trend report: "is Hone actually helping, day over day" for ONE
// developer on ONE repo, read entirely from this machine's own
// .claude/hone/analytics/outcomes.jsonl (engine/analytics.mjs). Never reads
// or writes any other developer's state - cross-developer rollups are a
// separate, explicit decision (see engine/diagnostics.mjs's header and the
// ERD's per-engineer-tracking non-goal), not something this script does.
//
// Usage: node engine/trends.mjs --repo <path> [--days 30]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { outcomesFile } from './analytics.mjs';
import { reportsDir } from './hone-paths.mjs';
import { resolveRepoName } from './repo-identity.mjs';

function parseArgs(argv) {
    const out = { days: 30 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--repo') out.repo = argv[++i];
        else if (argv[i] === '--days') out.days = parseInt(argv[++i], 10);
    }
    return out;
}

function readEvents(repoPath, cutoff) {
    let raw;
    try {
        raw = readFileSync(outcomesFile(repoPath), 'utf8');
    } catch {
        return [];
    }
    const events = [];
    for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
            const rec = JSON.parse(line);
            if (Date.parse(rec.ts) >= cutoff) events.push(rec);
        } catch {
            // corrupt line - skip, don't let it break the whole report
        }
    }
    return events;
}

function main() {
    const { repo: repoPath, days } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error('Usage: node engine/trends.mjs --repo <path> [--days 30]');
        process.exit(1);
    }
    const repo = resolveRepoName(repoPath);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const events = readEvents(repoPath, cutoff);

    const byDay = new Map(); // date -> { markersProcessed, findingsCreated, approved, rejected }
    const heuristicCounts = new Map();
    const dayOf = (ts) => ts.slice(0, 10);

    for (const e of events) {
        const day = dayOf(e.ts);
        if (!byDay.has(day)) byDay.set(day, { markersProcessed: 0, findingsCreated: 0, approved: 0, rejected: 0 });
        const row = byDay.get(day);
        if (e.event === 'sweep-completed') row.markersProcessed += e.markersProcessed || 0;
        if (e.event === 'finding-created') {
            row.findingsCreated += 1;
            for (const h of e.heuristics || []) heuristicCounts.set(h, (heuristicCounts.get(h) || 0) + 1);
        }
        if (e.event === 'finding-approved') row.approved += 1;
        if (e.event === 'finding-rejected') row.rejected += 1;
    }

    const days_ = [...byDay.keys()].sort();
    const totals = [...byDay.values()].reduce(
        (acc, r) => ({
            markersProcessed: acc.markersProcessed + r.markersProcessed,
            findingsCreated: acc.findingsCreated + r.findingsCreated,
            approved: acc.approved + r.approved,
            rejected: acc.rejected + r.rejected,
        }),
        { markersProcessed: 0, findingsCreated: 0, approved: 0, rejected: 0 },
    );

    const lines = [
        `# Hone trends — ${repo}`,
        '',
        `Last ${days} days. Read entirely from this machine's own local outcome log - nothing here is`,
        'from, or shared with, any other developer.',
        '',
        `- Sessions processed: ${totals.markersProcessed}`,
        `- Findings created: ${totals.findingsCreated}`,
        `- Approved: ${totals.approved}  ·  Rejected: ${totals.rejected}  ·  Still pending review: ${totals.findingsCreated - totals.approved - totals.rejected}`,
        '',
    ];

    if (heuristicCounts.size) {
        lines.push('## Which patterns showed up most');
        const sorted = [...heuristicCounts.entries()].sort((a, b) => b[1] - a[1]);
        for (const [h, count] of sorted) lines.push(`- ${h}: ${count}`);
        lines.push('');
    }

    lines.push('## By day');
    if (days_.length) {
        lines.push('| Date | Sessions processed | Findings | Approved | Rejected |', '|---|---|---|---|---|');
        for (const day of days_) {
            const r = byDay.get(day);
            lines.push(`| ${day} | ${r.markersProcessed} | ${r.findingsCreated} | ${r.approved} | ${r.rejected} |`);
        }
    } else {
        lines.push('No events recorded yet in this window - either Hone hasn\'t swept this repo, or the outcome log is fresh.');
    }

    const report = `${lines.join('\n')}\n`;
    console.log(report);

    const dir = reportsDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const outPath = join(dir, `hone-trends-${repo}-${stamp}.md`);
    writeFileSync(outPath, report);
    console.error(`\nTrends written to ${outPath}`);
}

main();
