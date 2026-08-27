#!/usr/bin/env node
// Resolves "which session transcript is this trigger about" for triggers
// that fire OUTSIDE a live Claude Code session (Triggers 1-3: a post-commit
// hook or CI workflow can't know a session id - the commit may land well
// after the session that produced it ended). v1 heuristic: the most-
// recently-modified transcript in this repo's project session directory,
// excluding one explicitly excluded id. Coarse on purpose - there's no
// stronger signal available at hook/CI time; this is the same trade-off
// CLAUDE.md accepts for the SessionStart safety net.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function projectSessionDir(repoPath) {
    return join(homedir(), '.claude', 'projects', repoPath.replace(/[/\\]/g, '-'));
}

// All transcripts for a repo, newest first.
export function listTranscripts(repoPath) {
    const dir = projectSessionDir(repoPath);
    if (!existsSync(dir)) return [];
    try {
        return readdirSync(dir)
            .filter((f) => f.endsWith('.jsonl'))
            .map((f) => {
                const file = join(dir, f);
                return { file, mtime: statSync(file).mtimeMs, id: f.replace(/\.jsonl$/, '') };
            })
            .sort((a, b) => b.mtime - a.mtime);
    } catch {
        return [];
    }
}

export function mostRecentTranscript(repoPath, excludeSessionId = null) {
    return listTranscripts(repoPath).find((c) => c.id !== excludeSessionId) || null;
}
