#!/usr/bin/env node
// Tier 2: the actual judgment call. Only invoked for what Tier 1 flags as a
// candidate. Uses the developer's own `claude` auth (headless -p). Output
// fields are named to map directly onto each repo's claude-feedback-log
// entry format (see engine/README.md).
//
// Default is sonnet/high, not haiku - decided 2026-08-21 from a real 10-
// session comparison (engine/tier2-compare.mjs) on fleek-monorepo: haiku
// flagged 9/10 sessions, sonnet(high) and opus(medium) both flagged only
// 2/10, converging on the clearest true positive. This plugin's own routing
// ladder (hooks/model-routing-context.mjs) already puts "verification/
// judging" - which is what Tier 2 actually does - at sonnet, not haiku;
// haiku's near-universal flag rate looked like too low a bar for something
// feeding a human review gate, not genuine thoroughness. Opus showed no
// quality edge over sonnet in that comparison, so it isn't the default.
// Before widening this to a new developer's machine, re-run the comparison
// against THEIR session history first (README's "Tier 2 model comparison"
// section) - one developer's data isn't proof this generalizes.
import { execFileSync } from 'node:child_process';
import { logEvent } from './log.mjs';

const DEFAULT_MODEL = process.env.HONE_TIER2_MODEL || 'sonnet';
const DEFAULT_EFFORT = process.env.HONE_TIER2_EFFORT || 'high';
const TIER2_TIMEOUT_MS = 90_000;

function buildPrompt({ excerpt, heuristics, anchorDetail, trigger }) {
    return [
        "You are assessing a short excerpt from a developer's Claude Code session transcript for",
        'harness friction: a place the AI coding tool likely fell short in a way that GENERALIZES',
        'to a reusable harness improvement - not a one-off mistake. Two distinct categories both count:',
        '  (a) CORRECTNESS/PROMPTING friction - a mistake, a correction, ambiguity, rework.',
        '  (b) MODEL/EFFORT ROUTING inefficiency - a frontier-tier model or high/xhigh/max effort doing',
        '      mechanical legwork (search, fetch, broad exploration, log/data sweeps) directly instead of',
        '      delegating it to a cheaper tier. This is a cost/speed gap, not a correctness one - judge it',
        '      by whether the delegated-out work genuinely fit a cheaper tier, not by whether the task',
        "      ultimately succeeded. A rule candidate here reads like \"delegate X-shaped work to haiku\"",
        '      or "add this to the routing ladder", not a corrected mistake.',
        '',
        `Trigger: ${trigger.type} in repo ${trigger.repo}`,
        `Heuristic(s) that flagged this excerpt: ${heuristics.join(', ')}`,
        anchorDetail ? `Flagged detail: ${anchorDetail}` : '',
        '',
        '--- TRANSCRIPT EXCERPT (secrets redacted) ---',
        excerpt,
        '--- END EXCERPT ---',
        '',
        'Judge ONLY from this excerpt. Respond with ONLY a single JSON object, no prose, no markdown',
        'fences, matching exactly this shape:',
        '{"isFinding": boolean,',
        ' "title": string (<=80 chars),',
        ' "whatClaudeDidWrong": string (1-2 sentences),',
        ' "correctionGiven": string (1-2 sentences; if no explicit correction is visible in the',
        '   excerpt, describe what the situation implies instead, prefixed "Inferred:"),',
        ' "ruleCandidate": string (1 sentence: what harness change - skill, rule, or hook - might help),',
        ' "confidence": "low"|"medium"|"high"}',
        'If the excerpt does NOT show a real, generalizable harness gap in EITHER category above, set',
        'isFinding to false and leave the other string fields as "".',
    ]
        .filter(Boolean)
        .join('\n');
}

// model/effort default to HONE_TIER2_MODEL/HONE_TIER2_EFFORT but can be
// overridden per call - lets a single process (e.g. a model-comparison run)
// exercise multiple configs without re-spawning, without changing the
// default any other caller (sweep-worker, pilot-run) gets when it doesn't pass them.
export function invokeTier2({ excerpt, heuristics, anchorDetail, trigger, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT }) {
    const prompt = buildPrompt({ excerpt, heuristics, anchorDetail, trigger });
    const args = ['-p', prompt, '--model', model, '--output-format', 'text'];
    if (effort) args.push('--effort', effort);

    let raw;
    try {
        raw = execFileSync('claude', args, {
            encoding: 'utf8',
            timeout: TIER2_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        });
    } catch (err) {
        // Tier 2 unavailable/errored - fail closed (no finding), but log it:
        // this is the single most useful diagnostic signal for "why did
        // findings stop appearing" (claude not found, auth expired, timeout).
        logEvent(trigger.repoPath, {
            component: 'tier2',
            level: 'error',
            message: `claude -p invocation failed (model=${model}${effort ? `, effort=${effort}` : ''})`,
            detail: err?.message,
        });
        return null;
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        logEvent(trigger.repoPath, {
            component: 'tier2',
            level: 'warn',
            message: 'claude -p returned no JSON object - model likely ignored the output-format instruction',
        });
        return null;
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
        logEvent(trigger.repoPath, {
            component: 'tier2',
            level: 'warn',
            message: 'claude -p returned malformed JSON',
            detail: err?.message,
        });
        return null;
    }
    if (!parsed || parsed.isFinding !== true) {
        // Not a failure - a legitimate negative judgment. Logged at info so
        // "did Tier 2 run at all" is answerable without treating every
        // no-finding result as an error.
        logEvent(trigger.repoPath, { component: 'tier2', level: 'info', message: 'no finding (isFinding: false)' });
        return null;
    }
    if (!parsed.title || !parsed.whatClaudeDidWrong || !parsed.ruleCandidate) {
        logEvent(trigger.repoPath, {
            component: 'tier2',
            level: 'warn',
            message: 'claude -p returned isFinding:true but a required field was missing',
        });
        return null;
    }

    return {
        title: String(parsed.title).slice(0, 80),
        whatClaudeDidWrong: String(parsed.whatClaudeDidWrong),
        correctionGiven: String(parsed.correctionGiven || ''),
        ruleCandidate: String(parsed.ruleCandidate),
        confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
        model,
        effort: effort || 'default',
    };
}
