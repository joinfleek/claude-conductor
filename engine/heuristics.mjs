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

// Mirrors this plugin's own documented routing ladder (see
// hooks/model-routing-context.mjs / skills/model-router): haiku should
// handle search/fetch/extraction/broad-exploration/mechanical work; frontier
// tiers (opus, fable, or high/xhigh/max effort) keep orchestration and
// delegate legwork out. A session running frontier-tier and doing this work
// directly, with zero delegation anywhere, is exactly the ladder being
// skipped - not a correctness bug, but a cost/speed one.
const FRONTIER_MODEL_RE = /opus|fable/i;
const FRONTIER_EFFORT_RE = /^(high|xhigh|max)$/i;
const DELEGABLE_TOOLS = new Set(['Bash', 'Grep', 'Read', 'Glob', 'WebFetch', 'WebSearch']);
const DELEGATION_TOOLS = new Set(['Agent', 'Task']);
const FRONTIER_TOOLCALL_THRESHOLD = 10;

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

    // D - frontier-tier model/effort doing delegable legwork directly, with
    // zero delegation (Agent/Task) anywhere in the session.
    let frontierToolCalls = 0;
    let frontierAnchorTurn = null;
    let frontierLabel = '';
    let delegationUsed = false;
    for (const t of turns) {
        if (t.role !== 'assistant') continue;
        if (t.toolUses.some((u) => DELEGATION_TOOLS.has(u.name))) delegationUsed = true;

        const isFrontier = FRONTIER_MODEL_RE.test(t.model) || FRONTIER_EFFORT_RE.test(t.effort);
        if (!isFrontier) continue;

        const delegableCalls = t.toolUses.filter((u) => DELEGABLE_TOOLS.has(u.name));
        if (delegableCalls.length) {
            frontierToolCalls += delegableCalls.length;
            frontierAnchorTurn = t;
            frontierLabel = `${t.model || 'unknown-model'}${t.effort ? ` (effort=${t.effort})` : ''}`;
        }
    }
    if (frontierToolCalls > FRONTIER_TOOLCALL_THRESHOLD && !delegationUsed) {
        heuristicsFired.add('D-frontier-no-delegation');
        anchors.push({
            turnIndex: frontierAnchorTurn ? frontierAnchorTurn.index : turns.length - 1,
            heuristic: 'D-frontier-no-delegation',
            detail: `${frontierLabel} made ${frontierToolCalls} direct Bash/Grep/Read/Glob/WebFetch/WebSearch calls itself; no Agent/Task delegation anywhere in the session`,
        });
    }

    return { isCandidate: heuristicsFired.size > 0, heuristicsFired: [...heuristicsFired], anchors };
}
