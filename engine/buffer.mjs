#!/usr/bin/env node
// Local Buffer (component 6): where the sweep worker writes findings the
// Assessment Engine produced. One JSON file per finding (same collision-free
// rationale as the Trigger Queue). Findings sit here, gitignored, until a
// developer reviews and approves a batch (skills/hone-review) - nothing here
// ever leaves the machine on its own.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bufferDir } from './hone-paths.mjs';
import { recordEvent } from './analytics.mjs';

function ensureDir(dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function appendFinding(repoPath, finding) {
    const dir = bufferDir(repoPath);
    ensureDir(dir);
    const filename = `${finding.createdAt.replace(/[:.]/g, '-')}-${finding.id}.json`;
    writeFileSync(join(dir, filename), JSON.stringify(finding, null, 2));
    return finding;
}

export function listBuffer(repoPath) {
    const dir = bufferDir(repoPath);
    if (!existsSync(dir)) return [];
    const findings = [];
    for (const name of readdirSync(dir)) {
        if (!name.endsWith('.json')) continue;
        const file = join(dir, name);
        try {
            findings.push({ ...JSON.parse(readFileSync(file, 'utf8')), _file: file });
        } catch {
            // corrupt/partial finding file - skip it
        }
    }
    findings.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
    return findings;
}

// outcome: 'approved' | 'rejected' | omitted (e.g. dropped as a duplicate) -
// when given, records a local outcome event for the trend view
// (engine/trends.mjs). This is the "did the developer act on it" signal -
// stays on this machine, never aggregated across developers by this call.
export function removeFindings(repoPath, ids, outcome = null) {
    const idSet = new Set(ids);
    for (const finding of listBuffer(repoPath)) {
        if (idSet.has(finding.id)) {
            try {
                rmSync(finding._file, { force: true });
                if (outcome) recordEvent(repoPath, { event: `finding-${outcome}`, findingId: finding.id });
            } catch {
                // best-effort
            }
        }
    }
}
