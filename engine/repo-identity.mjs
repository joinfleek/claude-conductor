#!/usr/bin/env node
// Canonical repo identity, derived from the git remote - NOT from the
// directory name.
//
// Why this exists: `basename(repoPath)` was the original approach, and it
// silently breaks for any developer whose local clone directory is named
// something other than the canonical repo name. Found for real on
// 2026-08-21 - a developer's fleek-monorepo clone lived at
// `.../fleek/fe-apps`, so basename gave "fe-apps", which isn't a key in
// proposal-writer.mjs's REPO_FORMATS. The comparison/pilot tooling worked
// fine (it only uses the name as a label), but /hone-review would have
// thrown `No claude-feedback-log format registered for repo "fe-apps"` the
// moment they approved a finding. A clone directory name is a local
// preference; the remote is the actual identity.
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

// Parses the repo name out of any standard git remote URL shape:
//   https://github.com/joinfleek/fleek-monorepo.git
//   git@github.com:joinfleek/fleek-monorepo.git
//   ssh://git@github.com/joinfleek/fleek-monorepo
export function repoNameFromRemoteUrl(url) {
    if (!url) return null;
    const cleaned = url.trim().replace(/\.git$/, '').replace(/\/+$/, '');
    const match = cleaned.match(/[/:]([^/:]+)\/([^/:]+)$/);
    return match ? match[2] : null;
}

// Returns the canonical repo name (e.g. "fleek-monorepo"), falling back to
// the directory basename only when there's no usable remote - a detached
// checkout or a repo that genuinely has no origin still gets *a* label
// rather than throwing.
export function resolveRepoName(repoPath) {
    try {
        const url = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return repoNameFromRemoteUrl(url) || basename(repoPath);
    } catch {
        return basename(repoPath);
    }
}
