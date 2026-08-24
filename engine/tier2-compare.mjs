#!/usr/bin/env node
// Model-comparison CLI for Tier 2 - deliberately separate from pilot-run.mjs:
// this NEVER writes to the real Local Buffer (engine/buffer.mjs), on purpose.
// It exists to answer "which model/effort should Tier 2 actually run at"
// with real evidence, without polluting a repo's real findings with
// throwaway comparison output. Once a config is chosen, run pilot-run.mjs
// (or set HONE_TIER2_MODEL/HONE_TIER2_EFFORT) for the real thing.
//
// Usage:
//   node engine/tier2-compare.mjs --repo <path> [--days 30]
//
// Runs every Tier 1 candidate in the window through THREE fixed configs -
// haiku (default effort), sonnet (effort=high), opus (effort=medium) - and
// renders a side-by-side markdown so the actual outputs can be read, not
// just their confidence labels.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTranscripts } from './resolve-transcript.mjs';
import { parseTranscript, excerptAround } from './transcript.mjs';
import { runTier1 } from './heuristics.mjs';
import { redact } from './redact.mjs';
import { invokeTier2 } from './tier2.mjs';
import { pickAnchor } from './assess.mjs';
import { reportsDir } from './hone-paths.mjs';
import { resolveRepoName } from './repo-identity.mjs';

const CONFIGS = [
    { label: 'haiku', model: 'haiku', effort: '' },
    { label: 'sonnet (effort=high)', model: 'sonnet', effort: 'high' },
    { label: 'opus (effort=medium)', model: 'opus', effort: 'medium' },
];

function parseArgs(argv) {
    const out = { days: 30 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--repo') out.repo = argv[++i];
        else if (a === '--days') out.days = parseInt(argv[++i], 10);
    }
    return out;
}

function renderResult(config, result) {
    if (!result) return `**${config.label}:** no finding (or Tier 2 call failed)`;
    return [
        `**${config.label}** — confidence: ${result.confidence}`,
        `- Title: ${result.title}`,
        `- What Claude did wrong: ${result.whatClaudeDidWrong}`,
        `- Correction given: ${result.correctionGiven}`,
        `- Rule candidate: ${result.ruleCandidate}`,
    ].join('\n');
}

function main() {
    const { repo: repoPath, days } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error('Usage: node engine/tier2-compare.mjs --repo <path> [--days 30]');
        process.exit(1);
    }
    const repo = resolveRepoName(repoPath);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const transcripts = listTranscripts(repoPath).filter((t) => t.mtime >= cutoff);

    const sections = [
        `# Hone Tier 2 model comparison — ${repo}`,
        '',
        `Window: last ${days} days. Configs: ${CONFIGS.map((c) => c.label).join(', ')}.`,
        '',
        '_This is a throwaway comparison run - nothing here is written to the real Local Buffer._',
        '',
    ];

    let candidateCount = 0;
    for (const t of transcripts) {
        let turns;
        try {
            turns = parseTranscript(t.file);
        } catch {
            continue;
        }
        if (!turns.length) continue;

        const tier1 = runTier1(turns, { repoPath });
        if (!tier1.isCandidate) continue;
        candidateCount++;

        const anchor = pickAnchor(tier1.anchors);
        if (!anchor) continue;

        const session = t.id.slice(0, 8);
        const date = new Date(t.mtime).toISOString().slice(0, 10);
        const excerpt = redact(excerptAround(turns, anchor.turnIndex, 3, 3000));
        const trigger = { type: 'tier2-compare', repo, repoPath, ref: null, timestamp: new Date().toISOString() };

        console.error(`[${session}] running ${CONFIGS.length} configs...`);
        sections.push(`## ${date} — session ${session}`, '', `Heuristics: ${tier1.heuristicsFired.join(', ')}`, '');

        for (const config of CONFIGS) {
            const result = invokeTier2({
                excerpt,
                heuristics: tier1.heuristicsFired,
                anchorDetail: anchor.detail,
                trigger,
                model: config.model,
                effort: config.effort,
            });
            sections.push(renderResult(config, result), '');
        }
    }

    if (!candidateCount) sections.push('No Tier 1 candidates in this window.');

    const report = `${sections.join('\n')}\n`;
    console.log(report);

    const dir = reportsDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const outPath = join(dir, `hone-tier2-compare-${repo}-${stamp}.md`);
    writeFileSync(outPath, report);
    console.error(`\nComparison written to ${outPath}`);
}

main();
