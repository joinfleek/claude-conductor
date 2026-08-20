#!/usr/bin/env node
// Tier 2: the actual judgment call. Only invoked for what Tier 1 flags as a
// candidate. Uses the developer's own `claude` auth (headless -p), cheap
// model by default. Output fields are named to map directly onto each repo's
// claude-feedback-log entry format (see engine/README.md).
import { execFileSync } from 'node:child_process';

const TIER2_MODEL = process.env.HONE_TIER2_MODEL || 'haiku';
const TIER2_TIMEOUT_MS = 45_000;

function buildPrompt({ excerpt, heuristics, trigger }) {
    return [
        "You are assessing a short excerpt from a developer's Claude Code session transcript for",
        'harness friction: a place the AI coding tool likely fell short in a way that GENERALIZES',
        'to a reusable harness improvement (a skill, rule, or hook) - not a one-off mistake.',
        '',
        `Trigger: ${trigger.type} in repo ${trigger.repo}`,
        `Heuristic(s) that flagged this excerpt: ${heuristics.join(', ')}`,
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
    ].join('\n');
}

export function invokeTier2({ excerpt, heuristics, trigger }) {
    const prompt = buildPrompt({ excerpt, heuristics, trigger });
    let raw;
    try {
        raw = execFileSync('claude', ['-p', prompt, '--model', TIER2_MODEL, '--output-format', 'text'], {
            encoding: 'utf8',
            timeout: TIER2_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        });
    } catch {
        return null; // Tier 2 unavailable/errored - fail closed, no finding
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
    if (!parsed || parsed.isFinding !== true) return null;
    if (!parsed.title || !parsed.whatClaudeDidWrong || !parsed.ruleCandidate) return null;

    return {
        title: String(parsed.title).slice(0, 80),
        whatClaudeDidWrong: String(parsed.whatClaudeDidWrong),
        correctionGiven: String(parsed.correctionGiven || ''),
        ruleCandidate: String(parsed.ruleCandidate),
        confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };
}
