#!/usr/bin/env python3
"""Episodic memory for Claude Code: FTS5 index over session transcripts.

Usage:
  search.py search "query terms" [--k 8] [--project <slug-substring>]
  search.py index          # incremental reindex only (search auto-indexes first)

Index lives at ~/.claude/session-index.db. Incremental by file mtime, so the
auto-index before each search only touches new/changed transcripts.
"""
import json
import os
import re
import sqlite3
import sys
from pathlib import Path

HOME = Path.home()
PROJECTS = HOME / '.claude' / 'projects'
DB = HOME / '.claude' / 'session-index.db'
MAX_MSG_CHARS = 2000
SNIPPET_CHARS = 300
# The index is a plaintext mirror of everything it reads; strip obvious
# credentials so pasted-during-debugging secrets don't get a second home.
SECRET_RE = re.compile(
    r'(sk-ant-[\w-]{20,}|sk-[\w-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[\w-]{10,}'
    r'|AKIA[0-9A-Z]{16}|eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{10,}'
    r'|-----BEGIN [A-Z ]*PRIVATE KEY-----)')


def redact(text):
    return SECRET_RE.sub('[REDACTED]', text)


def connect():
    db = sqlite3.connect(DB)
    db.executescript(
        'CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, mtime REAL);'
        'CREATE VIRTUAL TABLE IF NOT EXISTS msgs USING fts5('
        'session, project, role, ts, text);'
    )
    return db


def extract_texts(path):
    """Yield (role, ts, text) for user/assistant text content in a transcript."""
    with open(path, errors='replace') as f:
        for line in f:
            try:
                e = json.loads(line)
            except Exception:
                continue
            if e.get('type') not in ('user', 'assistant'):
                continue
            msg = e.get('message') or {}
            content = msg.get('content')
            parts = []
            if isinstance(content, str):
                parts = [content]
            elif isinstance(content, list):
                parts = [c.get('text', '') for c in content
                         if isinstance(c, dict) and c.get('type') == 'text']
            text = '\n'.join(p for p in parts if p).strip()
            if not text or text.startswith('<system-reminder>'):
                continue
            yield e.get('type'), e.get('timestamp', ''), redact(text[:MAX_MSG_CHARS])


def index(db, verbose=False):
    seen = dict(db.execute('SELECT path, mtime FROM files'))
    changed = 0
    # Top-level transcripts only; subagent/workflow transcripts live deeper
    # and would drown the index in tool noise.
    for path in PROJECTS.glob('*/*.jsonl'):
        p, mtime = str(path), path.stat().st_mtime
        if seen.get(p) == mtime:
            continue
        session = path.stem
        project = path.parent.name
        db.execute('DELETE FROM msgs WHERE session = ?', (session,))
        rows = [(session, project, role, ts, text)
                for role, ts, text in extract_texts(path)]
        db.executemany('INSERT INTO msgs VALUES (?,?,?,?,?)', rows)
        db.execute('INSERT OR REPLACE INTO files VALUES (?,?)', (p, mtime))
        changed += 1
    db.commit()
    if verbose:
        total = db.execute('SELECT count(*) FROM msgs').fetchone()[0]
        print(f'indexed {changed} changed transcript(s); {total} messages total')


def search(db, query, k, project):
    # FTS5 treats bare hyphens/specials as syntax; quote each term.
    terms = ' '.join(f'"{t}"' for t in re.findall(r'[\w.-]+', query))
    sql = ('SELECT session, project, role, ts, snippet(msgs, 4, "[", "]", "…", 40) '
           'FROM msgs WHERE msgs MATCH ?')
    args = [terms]
    if project:
        sql += ' AND project LIKE ?'
        args.append(f'%{project}%')
    sql += ' ORDER BY rank LIMIT ?'
    args.append(k)
    hits = db.execute(sql, args).fetchall()
    if not hits:
        print('no matches')
        return
    for session, proj, role, ts, snip in hits:
        print(f'--- {session} ({proj}) {role} {ts[:19]}')
        print(snip[:SNIPPET_CHARS])
    print(f'\nresume a session: claude --resume <session-id> --fork-session')


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('search', 'index'):
        print(__doc__)
        sys.exit(1)
    db = connect()
    if args[0] == 'index':
        index(db, verbose=True)
        return
    k, project, terms = 8, None, []
    it = iter(args[1:])
    for a in it:
        if a == '--k':
            k = int(next(it))
        elif a == '--project':
            project = next(it)
        else:
            terms.append(a)
    index(db)
    search(db, ' '.join(terms), k, project)


if __name__ == '__main__':
    main()
