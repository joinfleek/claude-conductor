#!/usr/bin/env node
// Tier 1: on-device heuristics, always run, zero cost, zero network.
// Deliberately simple v1 - three checks, OR-gated into "candidate for Tier 2".
// False positives here are cheap (Tier 2 is one Haiku call); false negatives
// (missed friction) are the worse failure mode, so the gate is permissive.
import { tokenize, jaccard } from './similarity.mjs';

const CORRECTION_PATTERNS = [
    /\bno[,.]?\s/i,
    /that'?s (not|wrong)/i,
    /don'?t do that/i,
    /\bundo\b/i,
    /revert that/i,
    /not what i asked/i,
    /try again/i,
    /that'?s not right/i,
    /stop doing/i,
];

const SIMILARITY_THRESHOLD = 0.6;
const TOOL_VOLUME_THRESHOLD = 15;

export function runTier1(turns) {
    const anchors = [];
    const heuristicsFired = new Set();

    // A - near-duplicate consecutive human prompts (signals rework/re-explaining).
    const humanTurns = turns.filter((t) => t.isHumanPrompt);
    let dupCount = 0;
    for (let i = 1; i < humanTurns.length; i++) {
        const sim = jaccard(tokenize(humanTurns[i - 1].text), tokenize(humanTurns[i].text));
        if (sim >= SIMILARITY_THRESHOLD) {
            dupCount++;
            anchors.push({
                turnIndex: humanTurns[i].index,
                heuristic: 'A-near-duplicate-prompt',
                detail: `similarity=${sim.toFixed(2)}`,
            });
        }
    }
    if (dupCount >= 2) heuristicsFired.add('A-near-duplicate-prompt');

    // B - explicit correction language in a human prompt following an assistant turn.
    let sawAssistantTurn = false;
    for (const t of turns) {
        if (t.role === 'assistant') {
            sawAssistantTurn = true;
            continue;
        }
        if (!t.isHumanPrompt || !sawAssistantTurn) continue;
        if (CORRECTION_PATTERNS.some((re) => re.test(t.text))) {
            heuristicsFired.add('B-correction-language');
            anchors.push({ turnIndex: t.index, heuristic: 'B-correction-language', detail: t.text.slice(0, 120) });
        }
    }

    // C - high tool-call volume with no plan-mode checkpoint anywhere in the transcript.
    const toolUseCount = turns.reduce((n, t) => n + t.toolUses.length, 0);
    const usedPlanMode = turns.some((t) => t.toolUses.some((u) => u.name === 'ExitPlanMode'));
    if (toolUseCount > TOOL_VOLUME_THRESHOLD && !usedPlanMode) {
        heuristicsFired.add('C-unreflected-volume');
        const lastToolTurn = [...turns].reverse().find((t) => t.toolUses.length > 0);
        anchors.push({
            turnIndex: lastToolTurn ? lastToolTurn.index : turns.length - 1,
            heuristic: 'C-unreflected-volume',
            detail: `toolUseCount=${toolUseCount}`,
        });
    }

    return { isCandidate: heuristicsFired.size > 0, heuristicsFired: [...heuristicsFired], anchors };
}
