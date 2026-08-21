#!/usr/bin/env node
// One-shot pilot CLI - run manually, without installing the plugin, wiring
// any hook, or waiting on a PR to merge. Bypasses the Trigger Queue/sweep-
// worker machinery entirely: walks a repo's session transcripts directly
// for a given day window, runs the Assessment Engine on each, and prints +
// writes a plain markdown report so the output is immediately visible.
//
// Usage:
//   node engine/pilot-run.mjs --repo <path> [--days 30] [--tier2] [--learning-summary] [--out <file>]
//
// Default is Tier-1-only (free, on-device, instant) - shows candidate
// volume before spending any claude -p calls. Pass --tier2 to run the full
// pipeline (Tier 1 + Tier 2) and get finished findings, written to the
// repo's Local Buffer exactly like a real trigger would, in one pass.
//
// --learning-summary is independent of --tier2 (and needs no go-ahead for
// one): it renders the SAME Tier 1 anchors as real, quoted excerpts from the
// developer's own sessions, each paired with a fixed, hand-written coaching
// tip - not a model judgment. Zero network calls either way.
//
// Both output files are dated + timestamped (hone-pilot-<repo>-<stamp>.md,
// hone-learning-<repo>-<stamp>.md) and land by default in
// <repo>/.claude/hone/reports/ - gitignored, so a developer keeps a running
// local record across runs without ever committing one. `--out` overrides
// only the pilot report's own path for a one-off custom location; the
// learning summary always lands in the reports dir.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTranscripts } from './resolve-transcript.mjs';
import { parseTranscript, excerptAround } from './transcript.mjs';
import { runTier1 } from './heuristics.mjs';
import { redact } from './redact.mjs';
import { assess } from './assess.mjs';
import { appendFinding } from './buffer.mjs';
import { buildLearningSummary } from './learning-summary.mjs';
import { reportsDir } from './hone-paths.mjs';
import { recordEvent } from './analytics.mjs';
import { resolveRepoName } from './repo-identity.mjs';

// Filesystem-safe timestamp shared by both output files from one run, so a
// pilot report and its paired learning summary are obviously the same run
// at a glance: 2026-08-21T14-32-05 (colons stripped, seconds precision).
function runStamp() {
    return new Date().toISOString().slice(0, 19).replace(/:/g, '-');
}

function parseArgs(argv) {
    const out = { days: 30, tier2: false, learningSummary: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--repo') out.repo = argv[++i];
        else if (a === '--days') out.days = parseInt(argv[++i], 10);
        else if (a === '--tier2') out.tier2 = true;
        else if (a === '--learning-summary') out.learningSummary = true;
        else if (a === '--out') out.out = argv[++i];
    }
    return out;
}

function main() {
    const { repo: repoPath, days, tier2, learningSummary, out } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error(
            'Usage: node engine/pilot-run.mjs --repo <path> [--days 30] [--tier2] [--learning-summary] [--out <file>]',
        );
        process.exit(1);
    }
    const repo = resolveRepoName(repoPath);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const transcripts = listTranscripts(repoPath).filter((t) => t.mtime >= cutoff);

    const lines = [];
    lines.push(`# Hone pilot run — ${repo}`);
    lines.push('');
    lines.push(`- Window: last ${days} days`);
    lines.push(`- Sessions scanned: ${transcripts.length}`);
    lines.push(
        `- Mode: ${tier2 ? 'Tier 1 + Tier 2 (real claude -p calls)' : 'Tier 1 only (free, on-device, no claude -p calls)'}`,
    );
    lines.push('');

    let candidateCount = 0;
    let findingCount = 0;
    const rows = [];
    const learningEntries = [];

    for (const t of transcripts) {
        let turns;
        try {
            turns = parseTranscript(t.file);
        } catch {
            continue;
        }
        if (!turns.length) continue;

        const tier1 = runTier1(turns);
        if (!tier1.isCandidate) continue;
        candidateCount++;

        const session = t.id.slice(0, 8);
        const date = new Date(t.mtime).toISOString().slice(0, 10);
        const heuristics = tier1.heuristicsFired.join(', ');

        if (learningSummary) {
            // One entry per DISTINCT heuristic that fired (first anchor of
            // each type) - not one per anchor, so a session with repeated
            // near-duplicate hits doesn't flood the summary with near-copies.
            for (const heuristic of tier1.heuristicsFired) {
                const anchor = tier1.anchors.find((a) => a.heuristic === heuristic);
                if (!anchor) continue;
                learningEntries.push({
                    session,
                    date,
                    heuristic,
                    excerpt: redact(excerptAround(turns, anchor.turnIndex, 3, 1500)),
                });
            }
        }

        if (!tier2) {
            rows.push({ session, date, heuristics, status: 'candidate (Tier 2 not run)' });
            continue;
        }

        const findings = assess({
            transcriptPath: t.file,
            sessionId: t.id,
            trigger: { type: 'pilot-run', repo, repoPath, ref: null, timestamp: new Date().toISOString() },
        });
        if (!findings.length) {
            rows.push({ session, date, heuristics, status: 'candidate, Tier 2 found nothing' });
            continue;
        }
        for (const f of findings) {
            appendFinding(repoPath, f);
            findingCount++;
            rows.push({ session, date, heuristics, status: `finding: ${f.title} (${f.confidence})` });
            recordEvent(repoPath, {
                event: 'finding-created',
                findingId: f.id,
                heuristics: f.evidence?.heuristics || [],
                confidence: f.confidence,
                tier2Model: f.tier2Model,
                triggerType: 'pilot-run',
            });
        }
    }

    if (tier2 && candidateCount > 0) {
        recordEvent(repoPath, { event: 'sweep-completed', markersProcessed: candidateCount, findingsCreated: findingCount });
    }

    lines.push(`- Tier 1 candidates: ${candidateCount}`);
    if (tier2) lines.push(`- Findings written to buffer: ${findingCount}`);
    lines.push('');

    if (rows.length) {
        lines.push('| Session | Date | Heuristics | Result |');
        lines.push('|---|---|---|---|');
        for (const r of rows) lines.push(`| ${r.session} | ${r.date} | ${r.heuristics} | ${r.status} |`);
    } else {
        lines.push('No candidates found in this window.');
    }

    const report = `${lines.join('\n')}\n`;
    console.log(report);

    // Dated + timestamped, landing in the repo's gitignored .claude/hone/reports/
    // by default - a running local record across runs, not scattered into
    // whatever directory the CLI happened to be invoked from. `--out`
    // overrides for a one-off custom path.
    const stamp = runStamp();
    const reportsDefaultDir = reportsDir(repoPath);
    // Always ensured, even when --out overrides the pilot report's own path -
    // the learning summary (when requested) still lands in the persistent
    // gitignored record below.
    if (!existsSync(reportsDefaultDir)) mkdirSync(reportsDefaultDir, { recursive: true });

    const outPath = out || join(reportsDefaultDir, `hone-pilot-${repo}-${stamp}.md`);
    writeFileSync(outPath, report);
    console.error(`\nReport written to ${outPath}`);
    if (tier2 && findingCount > 0) {
        console.error(
            `${findingCount} finding(s) also written to ${repoPath}/.claude/hone/buffer/ — run /hone-review in that repo to approve/reject.`,
        );
    }

    if (learningSummary) {
        const summary = buildLearningSummary({ repo, days, entries: learningEntries });
        const summaryPath = join(reportsDefaultDir, `hone-learning-${repo}-${stamp}.md`);
        writeFileSync(summaryPath, summary);
        console.error(`Learning summary written to ${summaryPath}`);
    }
}

main();
