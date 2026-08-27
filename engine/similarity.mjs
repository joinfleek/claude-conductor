#!/usr/bin/env node
// Shared text-similarity primitives - lightweight token-Jaccard, not embeddings.
// Used by Tier 1 heuristics (near-duplicate prompts) and the Digest/Batcher
// (dedup across findings). Deliberately simple per CLAUDE.md's dedup spec.

export function tokenize(text) {
    return new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
}

export function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const tok of a) if (b.has(tok)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
}
