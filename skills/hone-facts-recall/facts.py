#!/usr/bin/env python3
"""Semantic-knowledge search for Claude Code: FTS5 index over knowledge markdown.

Complements session-recall (episodic transcripts): this indexes the distilled
knowledge layer — auto-memory files, ~/.claude/rules, and any knowledge-bundle
directories listed in CONDUCTOR_KNOWLEDGE_DIRS (colon-separated), e.g. OKF
bundles. Chunked by ## heading so hits point at the exact concept section.

Usage:
  facts.py search "query terms" [--k 8]
  facts.py index          # incremental reindex only (search auto-indexes first)

Index lives at ~/.claude/facts-index.db. Incremental by file mtime.
"""
import os
import re
import sqlite3
import sys
from pathlib import Path

HOME = Path.home()
DB = HOME / '.claude' / 'facts-index.db'
SNIPPET_CHARS = 400
MAX_CHUNK_CHARS = 4000
# The index is a plaintext mirror of everything it reads; strip obvious
# credentials so a secret pasted into a note doesn't get a second home.
SECRET_RE = re.compile(
    r'(sk-ant-[\w-]{20,}|sk-[\w-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[\w-]{10,}'
    r'|AKIA[0-9A-Z]{16}|eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{10,}'
    r'|-----BEGIN [A-Z ]*PRIVATE KEY-----)')


# never index credential directories, even if pointed at them
BLOCKED_DIRS = {'.ssh', '.aws', '.gnupg', '.kube', '.docker', '.gcloud', '.config'}


def blocked(path):
    return any(part in BLOCKED_DIRS for part in path.parts)


def roots():
    r = [HOME / '.claude' / 'rules', *(HOME / '.claude' / 'projects').glob('*/memory')]
    for d in os.environ.get('CONDUCTOR_KNOWLEDGE_DIRS', '').split(':'):
        if d.strip():
            r.append(Path(d.strip()).expanduser())
    return [d for d in r if d.is_dir() and not blocked(d.resolve())]


def connect():
    db = sqlite3.connect(DB)
    os.chmod(DB, 0o600)
    db.executescript(
        'CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, mtime REAL);'
        'CREATE VIRTUAL TABLE IF NOT EXISTS facts USING fts5(path, heading, text);'
    )
    return db


def chunks(path):
    """Yield (heading, text) chunks split on ## headings; preamble uses the title."""
    body = path.read_text(errors='replace')
    heading = path.stem
    buf = []
    for line in body.splitlines():
        if line.startswith('## '):
            if buf:
                yield heading, '\n'.join(buf)[:MAX_CHUNK_CHARS]
            heading, buf = line[3:].strip(), []
        else:
            buf.append(line)
    if buf:
        yield heading, '\n'.join(buf)[:MAX_CHUNK_CHARS]


def index(db, verbose=False):
    seen = dict(db.execute('SELECT path, mtime FROM files'))
    live, changed = set(), 0
    for root in roots():
        for path in root.rglob('*.md'):
            if path.is_symlink() or blocked(path.resolve()):
                continue
            p, mtime = str(path), path.stat().st_mtime
            live.add(p)
            if seen.get(p) == mtime:
                continue
            db.execute('DELETE FROM facts WHERE path = ?', (p,))
            rows = [(p, h, SECRET_RE.sub('[REDACTED]', t)) for h, t in chunks(path) if t.strip()]
            db.executemany('INSERT INTO facts VALUES (?,?,?)', rows)
            db.execute('INSERT OR REPLACE INTO files VALUES (?,?)', (p, mtime))
            changed += 1
    for gone in set(seen) - live:
        db.execute('DELETE FROM facts WHERE path = ?', (gone,))
        db.execute('DELETE FROM files WHERE path = ?', (gone,))
        changed += 1
    db.commit()
    if verbose:
        total = db.execute('SELECT count(*) FROM facts').fetchone()[0]
        print(f'indexed {changed} changed file(s); {total} chunks total')


def search(db, query, k):
    terms = ' '.join(f'"{t}"' for t in re.findall(r'[\w.-]+', query))
    hits = db.execute(
        'SELECT path, heading, snippet(facts, 2, "[", "]", "…", 40) '
        'FROM facts WHERE facts MATCH ? ORDER BY rank LIMIT ?',
        (terms, k)).fetchall()
    if not hits:
        print('no matches')
        return
    for path, heading, snip in hits:
        print(f'--- {path} § {heading}')
        print(snip[:SNIPPET_CHARS])


def main():
    args = sys.argv[1:]
    if not args or args[0] not in ('search', 'index'):
        print(__doc__)
        sys.exit(1)
    db = connect()
    if args[0] == 'index':
        index(db, verbose=True)
        return
    k, terms = 8, []
    it = iter(args[1:])
    for a in it:
        if a == '--k':
            k = int(next(it))
        else:
            terms.append(a)
    index(db)
    search(db, ' '.join(terms), k)


if __name__ == '__main__':
    main()
