#!/usr/bin/env node
// SubagentStop: remove leftover agent worktrees under <repo>/.claude/worktrees/
// once they're safe to drop. The harness auto-removes UNCHANGED worktrees; this
// covers the changed-but-finished case (work committed and pushed).
// A worktree is removed ONLY if both hold:
//   1. clean — no uncommitted/untracked changes
//   2. pushed — no commits unreachable from every remote ref
// Anything else is left alone. Silent, best-effort.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const git = (dir, ...args) => {
    try {
        return execFileSync('git', ['-C', dir, ...args], { timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch { return null; }
};

try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    const repo = input.cwd || process.cwd();
    if (!git(repo, 'rev-parse', '--git-dir')) process.exit(0);
    const wtRoot = join(git(repo, 'rev-parse', '--show-toplevel').trim(), '.claude', 'worktrees');
    if (!existsSync(wtRoot)) process.exit(0);

    for (const name of readdirSync(wtRoot)) {
        const wt = join(wtRoot, name);
        if (!existsSync(join(wt, '.git'))) continue;
        const status = git(wt, 'status', '--porcelain');
        if (status === null || status.trim() !== '') continue;
        const unpushed = git(wt, 'rev-list', 'HEAD', '--not', '--remotes', '--count');
        if (unpushed === null || parseInt(unpushed, 10) !== 0) continue;
        const branch = (git(wt, 'rev-parse', '--abbrev-ref', 'HEAD') || '').trim();
        if (git(repo, 'worktree', 'remove', wt) === null) continue;
        if (branch && branch !== 'HEAD') git(repo, 'branch', '-D', branch);
    }
} catch {}
