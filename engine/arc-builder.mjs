#!/usr/bin/env node
// Feature-arc builder (prototype) - assembles the unit of work that actually
// matters, which is NOT a session. Measured on real data: one feature
// ("aie-61") spanned 5 sessions over 30 days, and sessions themselves
// branch-hop, so it's many-to-many in both directions. Everything else in
// Hone assesses a single session mid-flight, which is why it never saw the
// friction the developers actually complain about ("takes a lot of prompting
// to get a feature right", "AI makes unnecessary changes").
//
// Container: the BRANCH. Works in every repo. Enriched with a Linear ticket
// when the branch name carries one (fleek-monorepo enforces this via its
// pre-push hook; fleek-api does not yet, so ticket is optional metadata, never
// the key).
//
// Completion: PR state via `gh`, which is the universal signal and does not
// depend on ticket conventions:
//   merged            -> definitively done; the post-merge window is where the
//                        rework signal lives (what needed fixing after ship)
//   closed-unmerged   -> abandoned; itself an interesting finding
//   open + inactive   -> stalled
//   open + active     -> in progress, too early to assess
// Inactivity is only a FALLBACK for work that never had a PR at all.
//
// Read-only: no buffer writes, no PRs, no state mutation. Prototype.
//
// Usage:
//   node engine/arc-builder.mjs --repo <path> [--branch <name>] [--days 45]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { listTranscripts } from './resolve-transcript.mjs';
import { resolveRepoName } from './repo-identity.mjs';

const POST_MERGE_WINDOW_DAYS = parseInt(process.env.HONE_POST_MERGE_WINDOW_DAYS || '14', 10);
const STALLED_AFTER_DAYS = parseInt(process.env.HONE_STALLED_AFTER_DAYS || '5', 10);

// gh inherits a limited-scope GH_TOKEN in some shells; drop it so gh falls
// back to the keyring credential that actually has repo scope.
const ghEnv = { ...process.env };
delete ghEnv.GH_TOKEN;

function parseArgs(argv) {
    const out = { days: 45 };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--repo') out.repo = argv[++i];
        else if (argv[i] === '--branch') out.branch = argv[++i];
        else if (argv[i] === '--days') out.days = parseInt(argv[++i], 10);
    }
    return out;
}

function git(repoPath, args) {
    try {
        return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    } catch {
        return '';
    }
}

function gh(repoPath, args) {
    try {
        return execFileSync('gh', args, { cwd: repoPath, env: ghEnv, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    } catch {
        return '';
    }
}

// Linear ticket IDs Fleek uses (see fleek-monorepo tools/linear-link/validate.cjs).
const TICKET_RE = /\b(BUY|SOC|SUP|CASH|AIE|RANK|DES)-(\d+)\b/i;
function ticketFrom(branch) {
    const m = branch.match(TICKET_RE);
    return m ? `${m[1].toUpperCase()}-${m[2]}` : null;
}

// Walk transcripts once, attributing every human turn and every Edit/Write to
// the branch that was active ON THAT RECORD - not to the session as a whole.
// Session-level attribution double-counts every branch a session touched.
function collectSessionActivity(repoPath, cutoff) {
    const perBranch = new Map(); // branch -> { sessions:Set, humanTurns, edits, editsByFile:Map, first, last }

    for (const t of listTranscripts(repoPath).filter((x) => x.mtime >= cutoff)) {
        let raw;
        try {
            raw = readFileSync(t.file, 'utf8');
        } catch {
            continue;
        }
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            let rec;
            try {
                rec = JSON.parse(line);
            } catch {
                continue;
            }
            const branch = rec.gitBranch;
            if (!branch) continue;
            if (!perBranch.has(branch)) {
                perBranch.set(branch, {
                    sessions: new Set(),
                    humanTurns: 0,
                    edits: 0,
                    editsByFile: new Map(),
                    first: null,
                    last: null,
                });
            }
            const b = perBranch.get(branch);
            b.sessions.add(t.id);
            const ts = rec.timestamp ? Date.parse(rec.timestamp) : null;
            if (ts) {
                if (!b.first || ts < b.first) b.first = ts;
                if (!b.last || ts > b.last) b.last = ts;
            }

            if (rec.type === 'user') {
                const c = rec.message?.content;
                const isToolResultOnly =
                    Array.isArray(c) && c.some((x) => x?.type === 'tool_result') && !c.some((x) => x?.type === 'text');
                const hasText = typeof c === 'string' ? c.trim().length > 0 : Array.isArray(c) && c.some((x) => x?.type === 'text');
                if (hasText && !isToolResultOnly) b.humanTurns++;
            } else if (rec.type === 'assistant') {
                for (const blk of rec.message?.content || []) {
                    if (blk.type !== 'tool_use') continue;
                    if (!/^(Edit|Write|NotebookEdit)$/.test(blk.name)) continue;
                    const fp = blk.input?.file_path;
                    if (!fp) continue;
                    b.edits++;
                    b.editsByFile.set(fp, (b.editsByFile.get(fp) || 0) + 1);
                }
            }
        }
    }
    return perBranch;
}

function prFor(repoPath, branch) {
    const raw = gh(repoPath, [
        'pr', 'list', '--head', branch, '--state', 'all', '--limit', '5',
        '--json', 'number,state,mergedAt,createdAt,title,url',
    ]);
    if (!raw.trim()) return null;
    try {
        const prs = JSON.parse(raw);
        if (!prs.length) return null;
        // prefer a merged PR if several exist for the branch
        return prs.find((p) => p.mergedAt) || prs[0];
    } catch {
        return null;
    }
}

// Commits + files for an arc. MUST prefer gh when a PR exists: once a branch
// merges, `git log <branch> --not main` returns nothing (its commits are IN
// main), and the local branch may not even exist anymore. That silently
// produced 0 files for merged arcs - and since post-merge rework is computed
// against those files, "no rework found" was a false negative in exactly the
// case the whole design exists to measure. gh is authoritative and works
// whether or not the branch survives locally.
function arcCommitsAndFiles(repoPath, branch, pr) {
    if (pr?.number) {
        const raw = gh(repoPath, ['pr', 'view', String(pr.number), '--json', 'commits,files']);
        if (raw.trim()) {
            try {
                const d = JSON.parse(raw);
                const commits = (d.commits || []).map((c) => ({
                    sha: c.oid,
                    date: c.committedDate || c.authoredDate || '',
                    subject: c.messageHeadline || '',
                }));
                const files = new Set((d.files || []).map((f) => f.path).filter(Boolean));
                if (commits.length || files.size) return { commits, files };
            } catch {
                // fall through to git
            }
        }
    }
    // No PR (or gh unavailable): unmerged local branch, use git.
    const out = git(repoPath, ['log', branch, '--not', 'main', '--format=%H%x09%aI%x09%s']);
    const commits = out
        .split('\n')
        .filter(Boolean)
        .map((l) => {
            const [sha, date, subject] = l.split('\t');
            return { sha, date, subject };
        });
    const files = new Set();
    for (const c of commits) {
        for (const f of git(repoPath, ['show', '--name-only', '--format=', c.sha]).split('\n')) {
            if (f.trim()) files.add(f.trim());
        }
    }
    return { commits, files };
}

// Transcript tool inputs carry ABSOLUTE paths; git/gh speak repo-relative.
// Normalize so edit-churn can be cross-referenced against the PR's files.
function toRepoRelative(repoPath, filePath) {
    const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
    return filePath.startsWith(root) ? filePath.slice(root.length) : filePath;
}

// Not every post-merge touch is rework. Observed on the first real arc:
// AIE-61's files were touched the next day by `feat(design-system): register
// Pill + PillGroup` - follow-on FEATURE work extending what AIE-61 built, not
// a defect fix. Counting that as rework would inflate the metric with healthy
// activity. fleek-monorepo enforces commitlint as a required status check, so
// conventional-commit prefixes are reliable here; where they're absent the
// commit lands in 'unclassified' rather than being silently counted either way.
function classifyCommit(subject) {
    const m = (subject || '').match(/^([a-z]+)(\([^)]*\))?!?:/i);
    const type = m ? m[1].toLowerCase() : null;
    if (!type) return 'unclassified';
    if (['fix', 'bugfix', 'hotfix', 'revert'].includes(type)) return 'rework';
    if (type === 'feat') return 'extension';
    if (['refactor', 'perf'].includes(type)) return 'ambiguous';
    return 'maintenance';
}

// The rework signal: commits landing AFTER this arc merged that touch files
// the arc itself introduced/changed. Excludes the arc's own commits.
// Generated/lock files are touched by EVERY feature that regenerates them, so
// matching on them attributes unrelated work to this arc. Observed on
// fleek-api: three unrelated `feat(...)` commits appeared as rework of
// `fix/supplier-list-column-mapping` purely because all four touched
// `graphql.generated.ts`. (fleek-api's own claude-feedback-log has an entry
// forbidding hand-edits to __generated__ - same files, same reason.)
// The real fix is line-level blame; excluding generated paths is the
// pragmatic version until that exists.
const GENERATED_PATH_RE = /(^|\/)(__generated__|node_modules)\/|\.generated\.|(^|\/)(yarn\.lock|package-lock\.json|pnpm-lock\.yaml)$/;

function isGenerated(path) {
    return GENERATED_PATH_RE.test(path);
}

function postMergeFixes(repoPath, allFiles, mergedAt, ownShas, ownPrNumber) {
    const files = new Set([...allFiles].filter((f) => !isGenerated(f)));
    if (!mergedAt || !files.size) return { commits: [], files: new Set(), excludedGenerated: allFiles.size - files.size };
    const since = new Date(mergedAt).toISOString();
    const until = new Date(Date.parse(mergedAt) + POST_MERGE_WINDOW_DAYS * 86400000).toISOString();
    const fileList = [...files];
    const out = git(repoPath, [
        'log', 'main', `--since=${since}`, `--until=${until}`, '--format=%H%x09%aI%x09%s', '--name-only', '--', ...fileList,
    ]);

    // Squash-merge lands a NEW sha on main that matches no branch commit, so
    // ownShas alone can't exclude the arc's own merge - it reappears as its
    // own rework. Observed: `fix: ... (#8794)` counted as rework of PR #8794.
    // Conventional squash subjects carry the PR number, so match on that too.
    const ownPrTag = ownPrNumber ? `(#${ownPrNumber})` : null;
    const isOwn = (c) => ownShas.has(c.sha) || (ownPrTag && (c.subject || '').includes(ownPrTag));

    const touched = new Set();
    const commits = [];
    let current = null;
    for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        if (line.includes('\t')) {
            const [sha, date, subject] = line.split('\t');
            current = { sha, date, subject, files: [] };
            if (!isOwn(current)) commits.push(current);
        } else if (current && !isOwn(current)) {
            const f = line.trim();
            if (files.has(f)) {
                current.files.push(f);
                touched.add(f);
            }
        }
    }
    return {
        commits: commits.filter((c) => c.files.length),
        files: touched,
        excludedGenerated: allFiles.size - files.size,
    };
}

function classify(pr, lastActivity) {
    const idleDays = lastActivity ? (Date.now() - lastActivity) / 86400000 : null;
    if (pr?.mergedAt) return { status: 'merged', detail: `PR #${pr.number} merged ${pr.mergedAt.slice(0, 10)}` };
    if (pr && pr.state === 'CLOSED') return { status: 'abandoned', detail: `PR #${pr.number} closed unmerged` };
    if (pr && pr.state === 'OPEN') {
        return idleDays > STALLED_AFTER_DAYS
            ? { status: 'stalled', detail: `PR #${pr.number} open, idle ${idleDays.toFixed(1)}d` }
            : { status: 'active', detail: `PR #${pr.number} open, active` };
    }
    // No PR at all - inactivity is the only fallback signal available.
    if (idleDays === null) return { status: 'unknown', detail: 'no PR, no activity timestamps' };
    return idleDays > STALLED_AFTER_DAYS
        ? { status: 'inactive-no-pr', detail: `no PR, idle ${idleDays.toFixed(1)}d` }
        : { status: 'active', detail: 'no PR, recently active' };
}

function buildArc(repoPath, branch, activity) {
    const pr = prFor(repoPath, branch);
    const { commits, files } = arcCommitsAndFiles(repoPath, branch, pr);
    const ownShas = new Set(commits.map((c) => c.sha));
    const { status, detail } = classify(pr, activity?.last);
    const fixes = pr?.mergedAt
        ? postMergeFixes(repoPath, files, pr.mergedAt, ownShas, pr.number)
        : { commits: [], files: new Set(), excludedGenerated: 0 };

    const churn = activity
        ? [...activity.editsByFile.entries()]
              .map(([f, n]) => [toRepoRelative(repoPath, f), n])
              .sort((a, b) => b[1] - a[1])
        : [];
    return {
        branch,
        ticket: ticketFrom(branch),
        status,
        detail,
        pr,
        spanDays: activity?.first && activity?.last ? ((activity.last - activity.first) / 86400000).toFixed(1) : null,
        sessions: activity ? activity.sessions.size : 0,
        humanTurns: activity ? activity.humanTurns : 0,
        edits: activity ? activity.edits : 0,
        filesEdited: activity ? activity.editsByFile.size : 0,
        churnedFiles: churn.filter(([, n]) => n > 1).length,
        topChurn: churn.slice(0, 5),
        commits: commits.length,
        commitFiles: files.size,
        fixes,
        activityFirst: activity?.first || null,
        activityLast: activity?.last || null,
    };
}

// Branch-at-the-time attribution catches sessions that were merely SITTING on
// a checked-out branch, not working on it. Observed: a fleek-api arc whose PR
// merged in June showed "2 human turns, 1 edit" from an unrelated session 45
// days later, because that stale branch was still checked out. Flag the
// mismatch instead of reporting the numbers as if they belong to the arc.
function activityOutsidePrWindow(arc) {
    if (!arc.pr?.createdAt || !arc.activityFirst) return false;
    const opened = Date.parse(arc.pr.createdAt) - 7 * 86400000; // allow pre-PR work
    const closed = arc.pr.mergedAt ? Date.parse(arc.pr.mergedAt) + 2 * 86400000 : Date.now();
    return arc.activityFirst > closed || arc.activityLast < opened;
}

function render(arc) {
    const L = [];
    L.push(`## ${arc.ticket || arc.branch}`);
    L.push('');
    L.push(`- Branch: \`${arc.branch}\`${arc.ticket ? ` · Ticket: ${arc.ticket}` : ' · (no Linear ticket in branch name)'}`);
    L.push(`- Status: **${arc.status}** — ${arc.detail}`);
    if (arc.pr?.url) L.push(`- PR: ${arc.pr.url}`);
    L.push(`- Arc span: ${arc.spanDays ?? '?'} days · ${arc.sessions} session(s) · ${arc.humanTurns} human turns`);
    if (activityOutsidePrWindow(arc)) {
        L.push(
            '- ⚠️ **Session activity falls outside this PR\'s lifetime** — likely a stale branch left checked out,' +
                ' so the session/turn/churn numbers below probably belong to unrelated work, not this arc.',
        );
    }
    L.push('');
    L.push('**Code churn** (attributed per-record to this branch, not per-session)');
    L.push(`- ${arc.edits} edits across ${arc.filesEdited} files · ${arc.churnedFiles} file(s) edited more than once`);
    if (arc.topChurn.length) {
        L.push('- Most re-edited:');
        for (const [f, n] of arc.topChurn) L.push(`  - ${n}× \`${f}\``);
    }
    L.push('');
    L.push(`**Commits:** ${arc.commits} (touching ${arc.commitFiles} files)`);
    L.push('');
    if (arc.status === 'merged') {
        L.push(`**Post-merge activity** (${POST_MERGE_WINDOW_DAYS}d window — the signal you can only see after shipping)`);
        if (arc.fixes.commits.length) {
            const byKind = new Map();
            for (const c of arc.fixes.commits) {
                const k = classifyCommit(c.subject);
                if (!byKind.has(k)) byKind.set(k, []);
                byKind.get(k).push(c);
            }
            const rework = byKind.get('rework') || [];
            L.push(
                `- **Rework (fix/revert): ${rework.length}** · extension (feat): ${(byKind.get('extension') || []).length}` +
                    ` · ambiguous (refactor/perf): ${(byKind.get('ambiguous') || []).length}` +
                    ` · maintenance: ${(byKind.get('maintenance') || []).length}` +
                    ` · unclassified: ${(byKind.get('unclassified') || []).length}`,
            );
            for (const [kind, list] of byKind) {
                for (const c of list.slice(0, 5)) {
                    L.push(`  - [${kind}] \`${c.sha.slice(0, 8)}\` ${c.date.slice(0, 10)} — ${c.subject} (${c.files.length} file(s))`);
                }
            }
            if (!rework.length) {
                L.push('  - _No fix/revert commits: the follow-on activity was extension or maintenance, not defect repair._');
            }
        } else {
            L.push('- None. Nothing touched this arc\'s files after it merged.');
        }
    } else {
        L.push('_Post-merge rework not computed — arc has not merged._');
    }
    L.push('');
    return L.join('\n');
}

function main() {
    const { repo: repoPath, branch: onlyBranch, days } = parseArgs(process.argv.slice(2));
    if (!repoPath) {
        console.error('Usage: node engine/arc-builder.mjs --repo <path> [--branch <name>] [--days 45]');
        process.exit(1);
    }
    const repo = resolveRepoName(repoPath);
    const cutoff = Date.now() - days * 86400000;
    const perBranch = collectSessionActivity(repoPath, cutoff);

    let branches = [...perBranch.keys()].filter((b) => b !== 'main' && !b.startsWith('worktree-'));
    if (onlyBranch) branches = branches.filter((b) => b === onlyBranch || b.includes(onlyBranch));

    // Rank by real work volume so the prototype surfaces substantial arcs first.
    branches.sort((a, b) => (perBranch.get(b)?.edits || 0) - (perBranch.get(a)?.edits || 0));
    if (!onlyBranch) branches = branches.slice(0, 5);

    console.log(`# Feature arcs — ${repo}\n`);
    console.log(`Window: last ${days} days. Post-merge window: ${POST_MERGE_WINDOW_DAYS}d. Read-only prototype.\n`);
    for (const b of branches) {
        console.log(render(buildArc(repoPath, b, perBranch.get(b))));
    }
}

main();
