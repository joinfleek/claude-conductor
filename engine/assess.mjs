#!/usr/bin/env node
// Local Assessment Engine - component 1 of AI-1 (see CLAUDE.md). Framework-
// agnostic: takes a transcript path + trigger context, returns 0-1 structured
// findings. Never throws - every failure mode (unreadable transcript, Tier 2
// unavailable, malformed model output) fails closed to an empty result.
//
// Finding field names map directly onto each repo's claude-feedback-log entry
// format (title/whatClaudeDidWrong/correctionGiven/ruleCandidate) so the
// Proposal Writer (component 8) can render an entry with no reshaping. Source
// there should read "hone-sweep (trigger: <type>, session <id>, by @<dev>)" -
// a third source alongside the existing "session" and "pr-review".
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseTranscript, excerptAround } from './transcript.mjs';
import { runTier1 } from './heuristics.mjs';
import { redact } from './redact.mjs';
import { invokeTier2 } from './tier2.mjs';

// Order matters: this picks WHICH turn gets excerpted for Tier 2, so the
// most informative signal should win. Revised 2026-08-24 from three real
// calibration runs.
//
// E and F lead because they point at concrete code evidence (a file rewritten
// N times; files touched that nobody asked about) and they target the two
// complaints developers actually voice.
//
// A and B are DEMOTED, deliberately kept rather than fixed: they're
// near-free to evaluate so they stay in the harness, but neither is trusted
// to drive anchor selection. B in particular is known-noisy - its
// /\bno[,.]?\s/ pattern fires on "no idea"/"no problem" and misses real
// corrections like "not what I asked" - so it fires on ~57% of sessions while
// contributing almost nothing. Left unfixed by explicit decision; just no
// longer load-bearing.
//
// C is last: it fires on ~95% of candidates (>15 tool calls describes nearly
// every real working session), so it's the weakest discriminator available.
const ANCHOR_PRIORITY = [
    'E-file-rework',
    'F-scope-divergence',
    'D-frontier-no-delegation',
    'G-high-iteration',
    'B-correction-language',
    'A-near-duplicate-prompt',
    'C-unreflected-volume',
];

export function pickAnchor(anchors) {
    for (const heuristic of ANCHOR_PRIORITY) {
        const found = anchors.find((a) => a.heuristic === heuristic);
        if (found) return found;
    }
    return anchors[0] || null;
}

function developerEmail(repoPath) {
    try {
        return execFileSync('git', ['-C', repoPath, 'config', 'user.email'], { encoding: 'utf8' }).trim() || 'unknown';
    } catch {
        return 'unknown';
    }
}

// Objective session-scale measurements for the Tier 2 prompt. Counts only -
// no heuristic names, no thresholds, no language implying anything is wrong.
// The judge decides whether 49 edits to one file is thrash or appropriate
// iteration; our job is only to make the number visible, since a ~6-turn
// excerpt cannot show it.
const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function sessionFacts(turns, repoPath) {
    const root = repoPath ? (repoPath.endsWith('/') ? repoPath : `${repoPath}/`) : null;
    const inRepo = (p) => !root || p.startsWith(root);
    const facts = [];
    const humanTurns = turns.filter((t) => t.isHumanPrompt).length;
    const editsByFile = new Map();
    let toolCalls = 0;
    for (const t of turns) {
        toolCalls += t.toolUses.length;
        for (const u of t.toolUses) {
            if (!EDIT_TOOL_NAMES.has(u.name) || !u.filePath || !inRepo(u.filePath)) continue;
            editsByFile.set(u.filePath, (editsByFile.get(u.filePath) || 0) + 1);
        }
    }
    facts.push(`${humanTurns} developer message(s), ${toolCalls} tool call(s) in total.`);
    if (editsByFile.size) {
        const sorted = [...editsByFile.entries()].sort((a, b) => b[1] - a[1]);
        const totalEdits = sorted.reduce((n, [, c]) => n + c, 0);
        facts.push(`${totalEdits} file edit(s) across ${editsByFile.size} distinct file(s).`);
        const top = sorted.slice(0, 3).filter(([, c]) => c > 1);
        for (const [file, count] of top) {
            facts.push(`The file ${file.split('/').slice(-2).join('/')} was edited ${count} separate times.`);
        }
    }
    return facts;
}

function findingId(sessionId, heuristic, turnIndex) {
    return createHash('sha256').update(`${sessionId}:${heuristic}:${turnIndex}`).digest('hex').slice(0, 16);
}

// trigger: { type, repo, repoPath, ref?, timestamp }. tier2Model/tier2Effort
// override HONE_TIER2_MODEL/HONE_TIER2_EFFORT for this call only - lets a
// comparison run exercise multiple configs in one process (see
// engine/tier2-compare.mjs) without touching any other caller's default.
export function assess({ transcriptPath, sessionId, trigger, tier2Model, tier2Effort }) {
    let turns;
    try {
        turns = parseTranscript(transcriptPath);
    } catch {
        return [];
    }
    if (!turns.length) return [];

    const tier1 = runTier1(turns, { repoPath: trigger.repoPath });
    if (!tier1.isCandidate) return [];

    const anchor = pickAnchor(tier1.anchors);
    if (!anchor) return [];

    const excerpt = redact(excerptAround(turns, anchor.turnIndex, 3, 3000));
    const tier2Args = { excerpt, trigger, sessionFacts: sessionFacts(turns, trigger.repoPath) };
    if (tier2Model) tier2Args.model = tier2Model;
    if (tier2Effort) tier2Args.effort = tier2Effort;
    const tier2 = invokeTier2(tier2Args);
    if (!tier2) return [];

    return [
        {
            id: findingId(sessionId, anchor.heuristic, anchor.turnIndex),
            title: tier2.title,
            whatClaudeDidWrong: tier2.whatClaudeDidWrong,
            correctionGiven: tier2.correctionGiven,
            ruleCandidate: tier2.ruleCandidate,
            confidence: tier2.confidence,
            tier: 2,
            tier2Model: `${tier2.model}${tier2.effort !== 'default' ? ` (effort=${tier2.effort})` : ''}`,
            evidence: { transcriptPath, turnIndex: anchor.turnIndex, heuristics: tier1.heuristicsFired },
            developer: developerEmail(trigger.repoPath),
            repo: trigger.repo,
            trigger: { type: trigger.type, ref: trigger.ref || null, timestamp: trigger.timestamp },
            sessionId,
            createdAt: new Date().toISOString(),
        },
    ];
}

// Standalone CLI for validating this component before anything calls it:
//   node engine/assess.mjs <transcriptPath> <repo> <repoPath> [triggerType] [ref]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const [, , transcriptPath, repo, repoPath, triggerType = 'checkpoint', ref = ''] = process.argv;
    if (!transcriptPath || !repo || !repoPath) {
        console.error('Usage: node assess.mjs <transcriptPath> <repo> <repoPath> [triggerType] [ref]');
        process.exit(1);
    }
    const sessionId = transcriptPath.split('/').pop().replace(/\.jsonl$/, '');
    const findings = assess({
        transcriptPath,
        sessionId,
        trigger: { type: triggerType, repo, repoPath, ref, timestamp: new Date().toISOString() },
    });
    console.log(JSON.stringify(findings, null, 2));
}
