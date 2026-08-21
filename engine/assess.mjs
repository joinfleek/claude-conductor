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

// Preference order when Tier 1 fires multiple heuristics but only one anchor
// escalates to Tier 2 in v1: explicit correction language is the strongest
// direct signal; frontier-model-no-delegation is a distinct but precise
// signal (a conjunction of two conditions, not a lone threshold), so it
// ranks next; then repetition, then the coarser volume-without-reflection check.
const ANCHOR_PRIORITY = [
    'B-correction-language',
    'D-frontier-no-delegation',
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

    const tier1 = runTier1(turns);
    if (!tier1.isCandidate) return [];

    const anchor = pickAnchor(tier1.anchors);
    if (!anchor) return [];

    const excerpt = redact(excerptAround(turns, anchor.turnIndex, 3, 3000));
    const tier2Args = { excerpt, heuristics: tier1.heuristicsFired, anchorDetail: anchor.detail, trigger };
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
