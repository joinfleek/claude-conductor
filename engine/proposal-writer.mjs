#!/usr/bin/env node
// Proposal Writer (component 8): formats an APPROVED batch of findings into
// each repo's existing claude-feedback-log schema and opens one PR, with
// developer attribution surfaced as credit (governance requirement, see
// CLAUDE.md). Two known formats today - fleek-monorepo appends to a single
// shared file below a marker; fleek-api writes one file per entry. Add a new
// repo here if a third format shows up.
//
// Rendering (renderEntries/writeToRepo) is pure and safe to call any time.
// The git/gh operations (openProposalPr) are NOT - they push a branch and
// open a real PR against a shared repo. Only call openProposalPr from a flow
// where a developer just explicitly approved the batch (skills/hone-review).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const REPO_FORMATS = {
    'fleek-monorepo': { style: 'single-file', file: 'docs/claude-feedback-log.md', marker: '<!-- entries-start -->' },
    'fleek-api': { style: 'one-file-per-entry', dir: 'docs/claude-feedback-log' },
};

function slug(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function renderEntry(finding, headingLevel) {
    const date = finding.createdAt.slice(0, 10);
    const shortSession = (finding.sessionId || '').slice(0, 8);
    const heading = '#'.repeat(headingLevel);
    return [
        `${heading} [${date}] ${finding.title}`,
        `- **Source:** hone-sweep (trigger: ${finding.trigger?.type || 'unknown'}, session ${shortSession}, by @${finding.developer})`,
        `- **What Claude did wrong:** ${finding.whatClaudeDidWrong}`,
        `- **Correction given:** ${finding.correctionGiven}`,
        `- **Rule candidate:** ${finding.ruleCandidate}`,
    ].join('\n');
}

// Writes the batch into the repo's feedback-log files on disk (working tree
// only - no git operations). Returns the list of files touched, for the
// caller to `git add`.
export function writeToRepo(repoPath, repoName, findings) {
    const fmt = REPO_FORMATS[repoName];
    if (!fmt) throw new Error(`No claude-feedback-log format registered for repo "${repoName}"`);

    if (fmt.style === 'single-file') {
        const filePath = join(repoPath, fmt.file);
        const content = readFileSync(filePath, 'utf8');
        const markerIndex = content.indexOf(fmt.marker);
        if (markerIndex === -1) throw new Error(`Marker "${fmt.marker}" not found in ${filePath}`);
        const insertAt = markerIndex + fmt.marker.length;
        const sorted = [...findings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const block = `\n\n${sorted.map((f) => renderEntry(f, 2)).join('\n\n')}`;
        const updated = content.slice(0, insertAt) + block + content.slice(insertAt);
        writeFileSync(filePath, updated);
        return [fmt.file];
    }

    if (fmt.style === 'one-file-per-entry') {
        const dir = join(repoPath, fmt.dir);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const existing = new Set(readdirSync(dir));
        const touched = [];
        for (const finding of findings) {
            const date = finding.createdAt.slice(0, 10);
            let filename = `${date}-${slug(finding.title)}.md`;
            let n = 2;
            while (existing.has(filename)) {
                filename = `${date}-${slug(finding.title)}-${n}.md`;
                n += 1;
            }
            existing.add(filename);
            writeFileSync(join(dir, filename), `${renderEntry(finding, 1)}\n`);
            touched.push(join(fmt.dir, filename));
        }
        return touched;
    }

    throw new Error(`Unknown feedback-log style "${fmt.style}" for repo "${repoName}"`);
}

// Commits the already-written-to-disk batch on a new branch, pushes, and
// opens a PR via `gh`. Call ONLY after explicit developer approval.
export function openProposalPr(repoPath, repoName, findings, touchedFiles) {
    const branch = `hone/sweep-batch-${Date.now()}`;
    const developers = [...new Set(findings.map((f) => f.developer))];
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: repoPath, encoding: 'utf8' });

    run('git', ['checkout', '-b', branch]);
    run('git', ['add', ...touchedFiles]);
    run('git', [
        'commit',
        '-m',
        `feedback-log: AI-1 sweep batch (${findings.length} finding${findings.length === 1 ? '' : 's'})\n\nAttributed to: ${developers.join(', ')}`,
    ]);
    run('git', ['push', '-u', 'origin', branch]);

    const body = [
        '## AI-1 harness-friction batch',
        '',
        `${findings.length} finding(s) surfaced by the local Assessment Engine sweep, reviewed and approved by ${developers.join(', ')} before this PR was opened.`,
        '',
        ...findings.map((f) => `- **${f.title}** (confidence: ${f.confidence}) — attributed to @${f.developer}`),
        '',
        '_Generated by AI-1 (claude-conductor). Nothing in this batch was auto-promoted - a developer explicitly reviewed and approved it before this PR was opened._',
    ].join('\n');

    const prUrl = run('gh', ['pr', 'create', '--title', `feedback-log: AI-1 sweep batch (${findings.length})`, '--body', body]);
    return { branch, prUrl: prUrl.trim() };
}
