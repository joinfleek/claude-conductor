#!/usr/bin/env node
// Tier 2: the actual judgment call. Only invoked for what Tier 1 flags as a
// candidate. Uses the developer's own `claude` auth (headless -p). Output
// fields are named to map directly onto each repo's claude-feedback-log
// entry format (see engine/README.md).
//
// Default is sonnet/high. CONTESTED as of 2026-08-24 - do not treat as settled.
//
// It was chosen on 2026-08-21 from a 10-session comparison where haiku flagged
// 9/10 and sonnet/opus flagged 2/10 each. That sample was far too small to
// support the conclusion (a 95% CI on 2/10 spans roughly 3-56%), and a third
// calibration run (37 sessions) came back haiku 18 / sonnet 17 / opus 9 -
// haiku and sonnet at effectively the same rate, which the original rationale
// does not predict.
//
// In that larger run opus/medium was the clear precision leader: 8 distinct
// issues from 9 findings, vs sonnet's 8 from 17. Sonnet has better recall
// (it caught all 8 distinct issues; opus caught 6 of those plus 2 sonnet
// missed). Sonnet is kept as the default for now on recall grounds, and
// because much of the noise it produced traced to prompt contamination that
// has since been removed (see buildPrompt) - so its distinct-yield should
// improve without a model change. Re-measure before touching this again.
//
// Before widening to a new developer's machine, re-run the comparison against
// THEIR history first (README's "Tier 2 model comparison" section).
import { execFileSync } from 'node:child_process';
import { logEvent } from './log.mjs';

const DEFAULT_MODEL = process.env.HONE_TIER2_MODEL || 'sonnet';
const DEFAULT_EFFORT = process.env.HONE_TIER2_EFFORT || 'high';
const TIER2_TIMEOUT_MS = 90_000;

// NOTE: `heuristics` and `anchorDetail` are deliberately NOT passed into the
// prompt. They used to be, and it contaminated every judgment: telling the
// model "D-frontier-no-delegation fired" plus giving it a worked example of a
// routing rule caused it to write that answer back. Real output from that
// era: "the sheer volume of direct calls (221, per heuristic metadata)" and
// "the heuristics flagged this as a near-duplicate prompt" - the judge citing
// the label instead of reading the transcript. The heuristics decide WHICH
// excerpt to send; the judge must decide what's in it, independently.
function buildPrompt({ excerpt, trigger, sessionFacts }) {
    return [
        "You are assessing a short excerpt from a developer's Claude Code session transcript for",
        'harness friction: a place the AI coding tool likely fell short in a way that GENERALIZES',
        'to a reusable harness improvement (a skill, rule, or hook) - not a one-off mistake.',
        '',
        'Judge the excerpt on its own terms. Do not assume a problem exists because you were sent',
        'this excerpt; most sessions contain nothing worth reporting, and "no finding" is the correct',
        'answer far more often than not.',
        '',
        `Trigger: ${trigger.type} in repo ${trigger.repo}`,
        // Objective, session-wide measurements. The excerpt is a ~6-turn window
        // and physically cannot show session-scale facts like "this file was
        // rewritten 49 times". These are counts, not conclusions: no heuristic
        // names, no suggested rule shapes, nothing implying a problem exists.
        // Removing these entirely (an over-correction while stripping prompt
        // contamination) made the heaviest-rework session in the corpus return
        // "no finding" - the judge could see one ordinary edit and nothing else.
        ...(sessionFacts?.length ? ['', 'Measured facts about the full session (not visible in the excerpt):', ...sessionFacts.map((f) => `- ${f}`)] : []),
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
        'If the excerpt does NOT show a real, generalizable harness gap, set isFinding to false and',
        'leave the other string fields as "".',
    ]
        .filter(Boolean)
        .join('\n');
}

// model/effort default to HONE_TIER2_MODEL/HONE_TIER2_EFFORT but can be
// overridden per call - lets a single process (e.g. a model-comparison run)
// exercise multiple configs without re-spawning, without changing the
// default any other caller (sweep-worker, pilot-run) gets when it doesn't pass them.
export function invokeTier2({ excerpt, trigger, sessionFacts, model = DEFAULT_MODEL, effort = DEFAULT_EFFORT }) {
    const prompt = buildPrompt({ excerpt, trigger, sessionFacts });
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
