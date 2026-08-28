#!/usr/bin/env node
// Resolves "which session transcript is this trigger about" for triggers
// that fire OUTSIDE a live Claude Code session (Triggers 1-3: a post-commit
// hook or CI workflow can't know a session id - the commit may land well
// after the session that produced it ended). v1 heuristic: the most-
// recently-modified transcript in this repo's project session directory,
// excluding one explicitly excluded id. Coarse on purpose - there's no
// stronger signal available at hook/CI time; this is the same trade-off
// CLAUDE.md accepts for the SessionStart safety net.
//
// WIDENED 2026-08-28, two additions, both OPT-IN so existing callers keep
// their exact current behaviour (the calibration re-run is a controlled
// before/after; changing defaults here would confound it):
//
//   { recursive: true }  also walk <session-id>/subagents/**. On this machine
//                        that is 1,416 files against 108 top-level ones - ~93%
//                        of the corpus, and the entire agent-loop record.
//   { days: N }          filter on the session's OWN first timestamp, not file
//                        mtime. mtime is "last touched": resuming a session
//                        from May gives it a today mtime, so it lands inside a
//                        "last 14 days" window. mtime is still used as a cheap
//                        superset pre-filter, then confirmed against content.
import { existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function projectSessionDir(repoPath) {
    return join(homedir(), '.claude', 'projects', repoPath.replace(/[/\\]/g, '-'));
}

// Reads only the head of the file to find the first timestamp, so date-filtering
// a corpus doesn't mean parsing every transcript in full.
export function sessionStartedAt(file, probeBytes = 65536) {
    let fd;
    try {
        fd = openSync(file, 'r');
        const buf = Buffer.alloc(probeBytes);
        const n = readSync(fd, buf, 0, probeBytes, 0);
        const head = buf.subarray(0, n).toString('utf8');
        for (const line of head.split('\n')) {
            if (!line.trim()) continue;
            try {
                const ts = JSON.parse(line).timestamp;
                if (ts) return new Date(ts).getTime();
            } catch {
                // partial final line in the probe window, or a foreign line
            }
        }
        return null;
    } catch {
        return null;
    } finally {
        if (fd !== undefined) try { closeSync(fd); } catch { /* already gone */ }
    }
}

// Subagent transcripts live at either
//   <session-id>/subagents/agent-*.jsonl
//   <session-id>/subagents/workflows/<wf-id>/agent-*.jsonl
// Both shapes exist in a real corpus (105 and 1,311 files respectively here).
function walk(dir, depth, out) {
    if (depth > 4) return;
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, depth + 1, out);
        else if (e.name.endsWith('.jsonl')) out.push(p);
    }
}

// All transcripts for a repo, newest first.
export function listTranscripts(repoPath, opts = {}) {
    const dir = projectSessionDir(repoPath);
    if (!existsSync(dir)) return [];
    try {
        let files;
        if (opts.recursive) {
            files = [];
            walk(dir, 0, files);
        } else {
            files = readdirSync(dir)
                .filter((f) => f.endsWith('.jsonl'))
                .map((f) => join(dir, f));
        }

        const cutoff = opts.days ? Date.now() - opts.days * 24 * 60 * 60 * 1000 : null;

        return files
            .map((file) => {
                const rel = file.slice(dir.length + 1);
                const parts = rel.split('/');
                const base = parts[parts.length - 1].replace(/\.jsonl$/, '');
                const isSubagent = parts.includes('subagents');
                return {
                    file,
                    mtime: statSync(file).mtimeMs,
                    // Top-level: the filename IS the session id. Subagent files
                    // are named agent-<id>, and their session is the parent dir.
                    id: isSubagent ? parts[0] : base,
                    agentId: isSubagent ? base : null,
                    workflowId: isSubagent && parts.includes('workflows') ? parts[parts.indexOf('workflows') + 1] : null,
                    isSubagent,
                };
            })
            // mtime over-includes (a resumed old session looks recent) but never
            // under-includes, so it is a safe cheap pre-filter before the read.
            .filter((t) => (cutoff === null ? true : t.mtime >= cutoff))
            .map((t) => (cutoff === null ? t : { ...t, startedAt: sessionStartedAt(t.file) }))
            .filter((t) => {
                if (cutoff === null) return true;
                // Unreadable head: keep it rather than silently dropping data.
                return t.startedAt === null || t.startedAt >= cutoff;
            })
            .sort((a, b) => b.mtime - a.mtime);
    } catch {
        return [];
    }
}

export function mostRecentTranscript(repoPath, excludeSessionId = null) {
    return listTranscripts(repoPath).find((c) => c.id !== excludeSessionId) || null;
}
