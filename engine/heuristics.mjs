#!/usr/bin/env node
// Tier 1: on-device heuristics, always run, zero cost, zero network.
// Deliberately simple v1 - three checks, OR-gated into "candidate for Tier 2".
// False positives here are cheap (Tier 2 is one Haiku call); false negatives
// (missed friction) are the worse failure mode, so the gate is permissive.
import { tokenize, jaccard } from './similarity.mjs';

// Exported so engine/tier1-recall-audit.mjs can show an LLM exactly what's
// already covered, rather than re-discovering patterns that already exist.
export const CORRECTION_PATTERNS = [
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

export const SIMILARITY_THRESHOLD = 0.6;
export const TOOL_VOLUME_THRESHOLD = 15;

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
export const FRONTIER_TOOLCALL_THRESHOLD = 10;

// E/F/G target the two complaints developers actually voice, which A-D never
// measured: "it takes a lot of prompting to get a feature right" and "AI makes
// changes which are not necessary". A measures textual repetition between
// consecutive prompts, which is the wrong proxy - real iteration reuses almost
// no words ("make it tighter" -> "still too much padding" -> "try 12px").
// C counts ALL tool calls, so a 30-grep analysis session looks identical to a
// 30-edit rework spiral. These three read the edited FILE PATHS instead.
// Thresholds are calibrated against observed data, not guessed: the two
// heaviest sessions in the corpus showed 49 and 26 edits to a single file,
// with 288 and 85 human turns; ordinary sessions sit at 2-6 turns and 0-3 edits.
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
export const FILE_REWORK_THRESHOLD = 4; // same file edited this many times = rework
export const UNMENTIONED_FILES_THRESHOLD = 3; // edited-but-never-discussed files
export const ITERATION_TURN_THRESHOLD = 25; // human turns in a session that produced code

// A file counts as "mentioned" if its basename (with or without extension) or
// its immediate parent directory appears anywhere in the developer's own text.
// Deliberately generous - developers say "the CategoryList component", not a
// full path - because a false "unmentioned" is worse than a missed one here.
function mentionedInPrompts(filePath, humanText) {
    const parts = filePath.split('/').filter(Boolean);
    const base = parts[parts.length - 1] || '';
    const stem = base.replace(/\.[^.]+$/, '');
    const parent = parts[parts.length - 2] || '';
    for (const token of [base, stem, parent]) {
        if (token && token.length > 2 && humanText.includes(token.toLowerCase())) return true;
    }
    return false;
}

// Anchoring E/G on the edit turn itself lands inside a dense run of tool
// calls, and excerptAround collapses those to one-liners - the judge receives
// six lines of "[assistant used tools: Edit]" with no developer intent
// visible, and correctly returns nothing. Anchor on the nearest preceding
// human turn instead so the excerpt carries the actual instruction.
function nearestHumanTurnBefore(turns, index) {
    for (let i = Math.min(index, turns.length - 1); i >= 0; i--) {
        if (turns[i].isHumanPrompt) return i;
    }
    return index;
}

// opts.repoPath - when given, E and F only consider files INSIDE the repo.
// Without it, scratch work pollutes the signal: the heaviest "rework" in the
// corpus was 49 edits to ~/Desktop/ds-review/index.html, a throwaway HTML
// page being iterated on visually. That is normal authoring, not thrash, and
// it isn't repo code at all.
export function runTier1(turns, opts = {}) {
    const repoPath = opts.repoPath ? (opts.repoPath.endsWith('/') ? opts.repoPath : `${opts.repoPath}/`) : null;
    const inRepo = (p) => !repoPath || p.startsWith(repoPath);
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

    // ---- E/F/G: read the edited file paths, not the conversation surface ----
    const editTurns = [];
    const editsByFile = new Map(); // path -> { count, lastTurnIndex, firstTurnIndex }
    for (const t of turns) {
        if (t.role !== 'assistant') continue;
        for (const u of t.toolUses) {
            if (!EDIT_TOOLS.has(u.name) || !u.filePath) continue;
            if (!inRepo(u.filePath)) continue; // scratch/Desktop files are not repo rework
            editTurns.push(t);
            const e = editsByFile.get(u.filePath) || { count: 0, firstTurnIndex: t.index, lastTurnIndex: t.index };
            e.count += 1;
            e.lastTurnIndex = t.index;
            editsByFile.set(u.filePath, e);
        }
    }

    // E - the same file rewritten over and over: the literal fingerprint of
    // "it took a lot of prompting to get this right".
    let worstFile = null;
    for (const [file, e] of editsByFile) {
        if (!worstFile || e.count > worstFile.e.count) worstFile = { file, e };
    }
    if (worstFile && worstFile.e.count >= FILE_REWORK_THRESHOLD) {
        heuristicsFired.add('E-file-rework');
        anchors.push({
            turnIndex: nearestHumanTurnBefore(turns, worstFile.e.lastTurnIndex),
            heuristic: 'E-file-rework',
            detail: `${worstFile.file} was edited ${worstFile.e.count} times in this session`,
        });
    }

    // F - files edited that the developer never once referred to: the
    // mechanical fingerprint of "AI made changes which weren't necessary".
    const humanText = turns
        .filter((t) => t.isHumanPrompt)
        .map((t) => t.text)
        .join('\n')
        .toLowerCase();
    const unmentioned = [...editsByFile.keys()].filter((f) => !mentionedInPrompts(f, humanText));
    if (unmentioned.length >= UNMENTIONED_FILES_THRESHOLD) {
        heuristicsFired.add('F-scope-divergence');
        const firstUnmentioned = unmentioned
            .map((f) => ({ f, idx: editsByFile.get(f).firstTurnIndex }))
            .sort((a, b) => a.idx - b.idx)[0];
        anchors.push({
            turnIndex: firstUnmentioned.idx,
            heuristic: 'F-scope-divergence',
            detail:
                `${unmentioned.length} of ${editsByFile.size} edited files were never mentioned by the developer: ` +
                unmentioned.slice(0, 5).join(', '),
        });
    }

    // G - many rounds of back-and-forth in a session that actually produced
    // code. Gated on edits so long analysis/debugging sessions don't fire.
    const humanTurnCount = humanTurns.length;
    if (humanTurnCount >= ITERATION_TURN_THRESHOLD && editsByFile.size > 0) {
        heuristicsFired.add('G-high-iteration');
        anchors.push({
            turnIndex: nearestHumanTurnBefore(turns, editTurns.length ? editTurns[editTurns.length - 1].index : turns.length - 1),
            heuristic: 'G-high-iteration',
            detail: `${humanTurnCount} developer turns to produce edits across ${editsByFile.size} file(s)`,
        });
    }

    return { isCandidate: heuristicsFired.size > 0, heuristicsFired: [...heuristicsFired], anchors };
}
