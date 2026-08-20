#!/usr/bin/env node
// Shared on-disk layout for AI-1's per-repo, per-developer local state.
// Everything lives under <repoPath>/.claude/hone/ - gitignored in every
// consuming repo (add `.claude/hone/` to that repo's .gitignore once).
import { join } from 'node:path';

const HONE_ROOT = '.claude/hone';

export const honeRoot = (repoPath) => join(repoPath, HONE_ROOT);
export const queueDir = (repoPath) => join(honeRoot(repoPath), 'queue');
export const bufferDir = (repoPath) => join(honeRoot(repoPath), 'buffer');
export const stateDir = (repoPath) => join(honeRoot(repoPath), 'state');
