#!/usr/bin/env node
// SessionStart hook: one-time-per-repo backfill of recent session history
// into the Trigger Queue, so installing Hone doesn't lose the friction that
// already happened before install day. Fires on every SessionStart source
// but is a no-op after the first real run in a given repo - gated by
// engine/backfill.mjs's own done-flag, a single file-existence check, so
// this stays cheap and silent on every subsequent SessionStart, same
// philosophy as every other hook in this plugin.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { runFirstRunBackfill, backfillAlreadyRan } from '../engine/backfill.mjs';

function main() {
    let input;
    try {
        input = JSON.parse(readFileSync(0, 'utf8'));
    } catch {
        process.exit(0);
    }
    const cwd = input?.cwd;
    if (!cwd) process.exit(0);

    try {
        if (backfillAlreadyRan(cwd)) process.exit(0); // fast path - every SessionStart after the first

        const summary = runFirstRunBackfill(cwd, basename(cwd), { excludeSessionId: input.session_id });
        if (summary && summary.enqueued > 0) {
            const capNote = summary.truncated
                ? ` (capped at ${summary.enqueued} of ${summary.foundInWindow} found)`
                : '';
            console.log(
                `<system-reminder>Hone: first run in this repo - queued ${summary.enqueued} recent session(s) ` +
                    `from the last ${summary.days} days${capNote} for background review. These are read on a ` +
                    `later sweep, entirely on this machine; nothing is sent anywhere until you approve findings ` +
                    `in /hone-review.</system-reminder>`,
            );
        }
    } catch {
        // never block session startup on a backfill failure
    }
    process.exit(0);
}

main();
