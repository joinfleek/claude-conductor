#!/usr/bin/env node
// Renders Tier 1's raw signal into something a developer actually reads:
// real excerpts from their own sessions, paired with a plain-language label
// and a hand-written coaching tip - not an LLM judgment. Zero cost, zero
// network, available immediately with no Tier 2 go-ahead needed. Tier 2
// takes the SAME anchors/excerpts and asks a model to generalize them into
// a reusable harness rule; this module is the other, cheaper use of the
// same evidence - self-reflection, not harness-building.
const COACHING_TIPS = {
    'A-near-duplicate-prompt':
        "You repeated similar phrasing across two prompts in a row - the first one likely didn't fully land. Being specific about what's still missing (rather than re-stating the same ask) usually resolves it in one turn instead of two.",
    'B-correction-language':
        'You had to explicitly correct the approach here. Look at what was missing from the original ask - stating a constraint, an expected output shape, or a "don\'t do X" up front often avoids the correction entirely.',
    'C-unreflected-volume':
        'This session ran a lot of tool calls with no plan-mode checkpoint anywhere. For multi-step work, asking for a plan first gives you a chance to catch a wrong direction before the tool calls pile up.',
    'D-frontier-no-delegation':
        'A frontier-tier model/effort did a lot of raw searching/reading itself here. Asking it to delegate exploration to a subagent (or starting the legwork at a cheaper tier) is usually faster and cheaper for the same result.',
};

const HEURISTIC_LABELS = {
    'A-near-duplicate-prompt': 'Repeated yourself',
    'B-correction-language': 'Had to correct it',
    'C-unreflected-volume': 'Long session, no checkpoint',
    'D-frontier-no-delegation': 'Frontier tier did cheap work',
};

// entry: { session, date, heuristic, excerpt }
function renderEntry(entry) {
    const label = HEURISTIC_LABELS[entry.heuristic] || entry.heuristic;
    const tip = COACHING_TIPS[entry.heuristic] || '';
    return [
        `### ${entry.date} — ${label} (session ${entry.session})`,
        '',
        `> ${tip}`,
        '',
        '<details><summary>What actually happened (excerpt, secrets redacted)</summary>',
        '',
        '```',
        entry.excerpt,
        '```',
        '',
        '</details>',
    ].join('\n');
}

// entries: array of { session, date, heuristic, excerpt }, already sorted
// however the caller wants them presented.
export function buildLearningSummary({ repo, days, entries }) {
    const lines = [
        `# Hone learning summary — ${repo}`,
        '',
        `Last ${days} days, ${entries.length} moment(s) worth a look.`,
        '',
        '_Every excerpt below is quoted directly from your own sessions - not summarized or generated. The tip under each one is a fixed, hand-written note for that pattern type, not a model judgment. Nothing here has gone through Tier 2 or left this machine._',
        '',
    ];
    if (!entries.length) {
        lines.push('Nothing flagged in this window.');
        return `${lines.join('\n')}\n`;
    }
    for (const entry of entries) {
        lines.push(renderEntry(entry), '');
    }
    return `${lines.join('\n')}\n`;
}
