#!/usr/bin/env node
// SessionStart: if the user has opted in to anonymous delegation-metrics
// sharing (~/.claude/conductor-metrics-optin exists) and the last share was
// more than 7 days ago, print a one-line nudge so the model offers to run the
// metrics-share skill. Never blocks, never sends anything itself.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

try {
    const optin = join(homedir(), '.claude', 'conductor-metrics-optin');
    if (!existsSync(optin)) process.exit(0);
    const last = Date.parse(readFileSync(optin, 'utf8').trim()) || 0;
    if (Date.now() - last < WEEK_MS) process.exit(0);
    console.log(
        '<conductor-metrics-nudge>Anonymous delegation metrics have not been shared for over a week. ' +
        'Offer the user (once, do not insist) to run the claude-conductor metrics-share skill: it shows the exact anonymized payload and only sends after explicit consent.</conductor-metrics-nudge>'
    );
} catch {}
