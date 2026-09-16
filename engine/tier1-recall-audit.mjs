#!/usr/bin/env node
// Tier 1 RECALL audit - a different question than tier2-compare.mjs asks.
// tier2-compare.mjs checks Tier 2's PRECISION on sessions Tier 1 already
// flagged. This checks Tier 1's RECALL: of the sessions Tier 1 did NOT
// flag, does a real LLM judgment think real friction was missed - and if
// so, in what exact words? Tier 1 is a hard ceiling on the whole pipeline:
// Tier 2 can only ever refine what Tier 1 already caught, never rescue what
// Tier 1 silently discarded. The fixed CORRECTION_PATTERNS regex list in
// heuristics.mjs was hand-guessed, not derived from real developer phrasing
// - this is how that gets checked against evidence instead of assumption.
//
// Usage: node engine/tier1-recall-audit.mjs --repo <path> [--days 30]
//
// Deliberately never writes to the real Local Buffer - decision-support
// only, same posture as tier2-compare.mjs. Meant to run BEFORE widening
// Hone to a new developer: if it finds real missed friction, the exact
// phrases it extracts should feed back into heuristics.mjs's fixed pattern
// lists as an evidence-driven update, not a guess.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listTranscripts } from './resolve-transcript.mjs';
import { parseTranscript } from './transcript.mjs';
import {
    runTier1,
    CORRECTION_PATTERNS,
    SIMILARITY_THRESHOLD,
    TOOL_VOLUME_THRESHOLD,
    FRONTIER_TOOLCALL_THRESHOLD,
} from './heuristics.mjs';
import { redact } from './redact.mjs';
import { reportsDir } from './hone-paths.mjs';
import { resolveRepoName } from './repo-identity.mjs';

const AUDIT_MODEL = process.env.HONE_AUDIT_MODEL || 'sonnet';
const AUDIT_EFFORT = process.env.HONE_AUDIT_EFFORT || 'high';
const AUDIT_TIMEOUT_MS = 90_000;
const MAX_HUMAN_TEXT_CHARS = 6000; // caps a single session's audit prompt

function parseArgs(argv) {
    const out = { days: 30 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--repo') out.repo = argv[++i];
        else if (argv[i] === '--days') out.days = parseInt(argv[++i], 10);
    }
    return out;
}

function buildPrompt({ humanTurnsText, toolUseCount, usedPlanMode }) {
    return [
        "You are auditing whether a deterministic, code-only friction detector missed something",
        'real in this Claude Code session. The detector already checks for exactly these things,',
        'and NOTHING else - it has no judgment beyond these fixed rules:',
        `  - Near-duplicate consecutive developer prompts (word-overlap >= ${SIMILARITY_THRESHOLD}, twice)`,
        '  - Correction language matching ONLY this fixed regex list (case-insensitive):',
        `      ${CORRECTION_PATTERNS.map((r) => r.source).join('\n      ')}`,
        `  - More than ${TOOL_VOLUME_THRESHOLD} tool calls in the session with plan mode never used`,
        `  - A frontier-tier model/high-effort making more than ${FRONTIER_TOOLCALL_THRESHOLD} direct`,
        '    search/fetch tool calls with zero Agent/Task delegation anywhere in the session',
        '',
        'For THIS session, none of the above fired (that is why you are being asked to look at it).',
        `Structural facts: ${toolUseCount} total tool calls, plan mode used: ${usedPlanMode ? 'yes' : 'no'}.`,
        '',
        '--- EVERY DEVELOPER-AUTHORED PROMPT IN THIS SESSION, IN ORDER (secrets redacted) ---',
        humanTurnsText,
        '--- END ---',
        '',
        'Judge independently: does this session show real friction - rework, an implicit or',
        'differently-worded correction, frustration, scope confusion, repeated re-explaining -',
        "that the fixed rules above would plausibly miss because they don't cover that PHRASING or",
        'PATTERN? Do not flag something just because it is imperfect; flag it only if a human',
        'reviewer would call it a real, recurring-pattern-worthy friction point.',
        '',
        'If yes: quote the EXACT phrase(s) verbatim (so they can be considered as new fixed',
        'patterns), and say which existing category they are closest to, or "new-category" if none fit.',
        '',
        'Respond with ONLY a single JSON object, no prose, no markdown fences:',
        '{"missedFriction": boolean,',
        ' "exactPhrases": [string],',
        ' "category": "near-duplicate-prompt"|"correction-language"|"unreflected-volume"|"frontier-no-delegation"|"new-category"|"",',
        ' "confidence": "low"|"medium"|"high",',
        ' "reasoning": string (1-2 sentences)}',
        'If nothing real was missed, set missedFriction to false and leave the other fields empty/"".',
    ].join('\n');
}

function auditSession({ humanTurnsText, toolUseCount, usedPlanMode }) {
    const prompt = buildPrompt({ humanTurnsText, toolUseCount, usedPlanMode });
    let raw;
    try {
        raw = execFileSync('claude', ['-p', prompt, '--model', AUDIT_MODEL, '--effort', AUDIT_EFFORT, '--output-format', 'text'], {
            encoding: 'utf8',
            timeout: AUDIT_TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
        });
    } catch {
        return null;
    }
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
        return JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
}

function main() {
    const { repo: repoPath, days } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error('Usage: node engine/tier1-recall-audit.mjs --repo <path> [--days 30]');
        process.exit(1);
    }
    const repo = resolveRepoName(repoPath);
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const transcripts = listTranscripts(repoPath).filter((t) => t.mtime >= cutoff);

    const header = [
        `# Hone Tier 1 recall audit — ${repo}`,
        '',
        `Window: last ${days} days. Model: ${AUDIT_MODEL} (effort=${AUDIT_EFFORT}).`,
        '',
        '_Checks ONLY sessions Tier 1 did NOT flag - the goal is finding false negatives in the',
        'fixed heuristics, not re-judging what Tier 1 already caught (that is tier2-compare.mjs).',
        'Never writes to the real Local Buffer._',
        '',
    ];
    const lines = [];

    let checked = 0;
    let missedCount = 0;
    const missedPhrases = [];

    for (const t of transcripts) {
        let turns;
        try {
            turns = parseTranscript(t.file);
        } catch {
            continue;
        }
        if (!turns.length) continue;

        const tier1 = runTier1(turns, { repoPath });
        if (tier1.isCandidate) continue; // this is what tier2-compare.mjs already checks

        const humanTurns = turns.filter((turn) => turn.isHumanPrompt);
        if (!humanTurns.length) continue;

        const toolUseCount = turns.reduce((n, turn) => n + turn.toolUses.length, 0);
        const usedPlanMode = turns.some((turn) => turn.toolUses.some((u) => u.name === 'ExitPlanMode'));
        let humanTurnsText = redact(humanTurns.map((turn) => turn.text).join('\n---\n'));
        if (humanTurnsText.length > MAX_HUMAN_TEXT_CHARS) {
            humanTurnsText = `${humanTurnsText.slice(0, MAX_HUMAN_TEXT_CHARS)}\n[...truncated...]`;
        }

        const session = t.id.slice(0, 8);
        const date = new Date(t.mtime).toISOString().slice(0, 10);
        console.error(`[${session}] auditing (not a Tier 1 candidate)...`);
        checked++;

        const result = auditSession({ humanTurnsText, toolUseCount, usedPlanMode });
        if (!result) {
            lines.push(`## ${date} — session ${session}`, '', '_Audit call failed or returned malformed output._', '');
            continue;
        }
        if (!result.missedFriction) {
            lines.push(`## ${date} — session ${session}`, '', '_No missed friction found._', '');
            continue;
        }

        missedCount++;
        lines.push(
            `## ${date} — session ${session} — POSSIBLE MISS (confidence: ${result.confidence})`,
            '',
            `- Closest category: ${result.category || '(unspecified)'}`,
            `- Reasoning: ${result.reasoning || ''}`,
            `- Exact phrase(s): ${(result.exactPhrases || []).map((p) => `"${p}"`).join(', ') || '(none given)'}`,
            '',
        );
        for (const phrase of result.exactPhrases || []) missedPhrases.push({ session, category: result.category, phrase });
    }

    const summary = [`- Non-candidate sessions checked: ${checked}`, `- Possible missed friction: ${missedCount}`, ''];

    const phraseLines = [];
    if (missedPhrases.length) {
        phraseLines.push('## Candidate phrases to consider adding to CORRECTION_PATTERNS / new heuristics', '');
        for (const p of missedPhrases) phraseLines.push(`- [${p.category}] "${p.phrase}" (session ${p.session})`);
        phraseLines.push('');
    }

    const report = `${[...header, ...summary, ...lines, ...phraseLines].join('\n')}\n`;
    console.log(report);

    const dir = reportsDir(repoPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const outPath = join(dir, `hone-tier1-recall-audit-${repo}-${stamp}.md`);
    writeFileSync(outPath, report);
    console.error(`\nRecall audit written to ${outPath}`);
}

main();
