#!/usr/bin/env node
// UserPromptSubmit hook: every Nth prompt, remind the agent to persist durable
// knowledge instead of letting it die with the session (Hermes-style
// agent-curated write-back). Per-session counter in the OS temp dir.
// Configure cadence with CONDUCTOR_NUDGE_EVERY (default 12).
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NUDGE_EVERY = parseInt(process.env.CONDUCTOR_NUDGE_EVERY || '12', 10);

let sid = 'unknown';
try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    sid = input.session_id || 'unknown';
} catch {}

const counterFile = join(tmpdir(), `conductor-memory-nudge-${sid}`);
let n = 0;
try { n = parseInt(readFileSync(counterFile, 'utf8'), 10) || 0; } catch {}
n += 1;
try { writeFileSync(counterFile, String(n)); } catch {}

// Post-task reflection flag dropped by the Stop hook when the previous turn
// used heavy tooling — fire once, immediately, independent of the cadence.
const reflectFlag = join(tmpdir(), `conductor-reflect-${sid}`);
let toolCount = null;
try { toolCount = readFileSync(reflectFlag, 'utf8').trim(); unlinkSync(reflectFlag); } catch {}

if (toolCount !== null) {
    console.log(
        `<system-reminder>Post-task reflection: the previous turn used ${toolCount} tool calls. If it solved a problem via a reusable PROCEDURE not already covered by an existing skill, draft it as a skill now (or add the recipe to your knowledge base). If an EXISTING skill or memory proved wrong or stale during that task, patch it now. If neither applies, continue without comment.</system-reminder>`
    );
}

// Goal-contract flag dropped by the Stop hook (goal-contract-gate.mjs) when
// an ACTIVE contract still has unchecked completion criteria — fire once.
const contractFlag = join(tmpdir(), `conductor-goal-contract-${sid}`);
let contractInfo = null;
try { contractInfo = readFileSync(contractFlag, 'utf8').trim(); unlinkSync(contractFlag); } catch {}

if (contractInfo !== null) {
    const [path, unchecked] = contractInfo.split('|');
    console.log(
        `<system-reminder>Goal contract: ${unchecked} unchecked completion criteria remain in ${path}. Before declaring the task done, reopen the contract, paste real evidence against each box, and only check boxes the evidence actually supports. Report any criterion you can't check as NOT done.</system-reminder>`
    );
}

if (n % NUDGE_EVERY === 0) {
    console.log(
        '<system-reminder>Memory nudge: pause and check whether this session has produced durable knowledge not yet persisted — ' +
        'a new fact, decision, fixed bug, or gotcha. If yes, write it to your persistent memory (memory directory, knowledge base, or the appropriate CLAUDE.md). ' +
        'If the task used 5+ tool calls and taught a reusable procedure, consider drafting it as a skill; if an existing skill proved wrong or stale, patch it. ' +
        'If nothing durable emerged, continue without comment.</system-reminder>'
    );
}
