#!/usr/bin/env node
// Sweep worker (second half of component 5): the detached child the
// UserPromptSubmit dispatch hook spawns. Drains the Trigger Queue for one
// repo, runs the Assessment Engine per marker, writes findings to the Local
// Buffer, and drops a digest-ready flag once the Digest/Batcher's threshold
// is crossed. Runs fully independent of the hook's lifecycle (see
// hooks/hone-sweep-dispatch.mjs and CLAUDE.md's detached-spawn design).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listPending, removeMarker } from './queue.mjs';
import { assess } from './assess.mjs';
import { appendFinding, listBuffer } from './buffer.mjs';
import { isDue } from './digest.mjs';
import { stateDir } from './hone-paths.mjs';
import { mostRecentTranscript } from './resolve-transcript.mjs';
import { logEvent } from './log.mjs';
import { recordEvent } from './analytics.mjs';

function ensureDir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function main() {
    const [, , repoPath, repoName] = process.argv;
    if (!repoPath || !repoName) {
        console.error('Usage: node sweep-worker.mjs <repoPath> <repoName>');
        process.exit(1);
    }

    let markersProcessed = 0;
    let findingsCreated = 0;

    for (const marker of listPending(repoPath)) {
        markersProcessed++;
        try {
            // Triggers 1-3 (post-commit, post-PR, post-ERD) fire outside a live
            // session and can't know which session did the work - resolve the
            // best-guess transcript at drain time instead (same heuristic the
            // SessionStart safety net uses: most recently modified, v1-coarse).
            let transcriptPath = marker.transcriptPath;
            let sessionId = marker.sessionId;
            if (!transcriptPath) {
                const resolved = mostRecentTranscript(repoPath);
                // No transcript found at all for this repo (e.g. CI runner with no
                // local session history) - nothing to assess; `finally` still drops
                // the marker so it doesn't wedge the queue forever.
                if (!resolved) continue;
                transcriptPath = resolved.file;
                sessionId = resolved.id;
            }
            const findings = assess({
                transcriptPath,
                sessionId,
                trigger: {
                    type: marker.triggerType,
                    repo: repoName,
                    repoPath,
                    ref: marker.ref,
                    timestamp: marker.timestamp,
                },
            });
            for (const finding of findings) {
                appendFinding(repoPath, finding);
                findingsCreated++;
                recordEvent(repoPath, {
                    event: 'finding-created',
                    findingId: finding.id,
                    heuristics: finding.evidence?.heuristics || [],
                    confidence: finding.confidence,
                    tier2Model: finding.tier2Model,
                    triggerType: marker.triggerType,
                });
            }
        } catch (err) {
            // one bad marker must not wedge the rest of the drain - but log it,
            // it's real signal (a genuinely broken marker, not a Tier 2 no-finding).
            logEvent(repoPath, {
                component: 'sweep-worker',
                level: 'error',
                message: `marker processing failed (trigger=${marker.triggerType})`,
                sessionId: marker.sessionId,
                detail: err?.message,
            });
        } finally {
            removeMarker(marker);
        }
    }

    if (markersProcessed > 0) {
        recordEvent(repoPath, { event: 'sweep-completed', markersProcessed, findingsCreated });
    }

    const buffered = listBuffer(repoPath);
    if (isDue(buffered)) {
        const dir = stateDir(repoPath);
        ensureDir(dir);
        writeFileSync(join(dir, 'digest-ready.flag'), String(buffered.length));
        logEvent(repoPath, { component: 'sweep-worker', level: 'info', message: `digest ready (${buffered.length} buffered)` });
    }
}

main();
