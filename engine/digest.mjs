#!/usr/bin/env node
// Digest/Batcher (component 7): fires on a content threshold since the last
// push, with a time-ceiling safety net - not a calendar. Runs an explicit
// dedup pass every time (same repo + text-similarity on title+description -
// lightweight, not embeddings, per CLAUDE.md).
import { tokenize, jaccard } from './similarity.mjs';

const DEDUP_SIMILARITY_THRESHOLD = 0.5;
const DEFAULT_THRESHOLD = parseInt(process.env.HONE_DIGEST_THRESHOLD || '5', 10);
const DEFAULT_MAX_AGE_MS = parseInt(process.env.HONE_DIGEST_MAX_AGE_MS || String(7 * 24 * 60 * 60 * 1000), 10);

// Returns { kept, dropped } - dropped findings carry `duplicateOf` so nothing
// silently vanishes without a trace back to what it deduped against.
export function dedupe(findings) {
    const kept = [];
    const dropped = [];
    for (const finding of findings) {
        const tokens = tokenize(`${finding.title} ${finding.whatClaudeDidWrong}`);
        const dupOf = kept.find((k) => {
            if (k.repo !== finding.repo) return false;
            return jaccard(tokens, tokenize(`${k.title} ${k.whatClaudeDidWrong}`)) >= DEDUP_SIMILARITY_THRESHOLD;
        });
        if (dupOf) {
            dropped.push({ ...finding, duplicateOf: dupOf.id });
        } else {
            kept.push(finding);
        }
    }
    return { kept, dropped };
}

export function isDue(findings, { threshold = DEFAULT_THRESHOLD, maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
    if (!findings.length) return false;
    if (findings.length >= threshold) return true;
    const oldest = findings.reduce((min, f) => Math.min(min, Date.parse(f.createdAt)), Infinity);
    return Number.isFinite(oldest) && Date.now() - oldest >= maxAgeMs;
}
