#!/usr/bin/env bash
# Pre-release gate: syntax, manifest integrity, and secret scan.
# Run from the repo root before tagging a release. Exit 0 = clean.
set -u
cd "$(dirname "$0")/.."
fail=0
err() { echo "FAIL: $*" >&2; fail=1; }

# 1. Every .mjs hook parses
for f in hooks/*.mjs; do
  node --check "$f" 2>/dev/null || err "node --check $f"
done

# 2. Every skill .py compiles
while IFS= read -r f; do
  python3 -m py_compile "$f" 2>/dev/null || err "py_compile $f"
done < <(find skills -name '*.py')

# 3. JSON manifests parse
for f in hooks/hooks.json .claude-plugin/plugin.json .claude-plugin/marketplace.json docs/*.json; do
  [ -f "$f" ] || continue
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" 2>/dev/null || err "invalid JSON: $f"
done

# 4. Every file referenced in hooks.json exists
while IFS= read -r ref; do
  [ -f "$ref" ] || err "hooks.json references missing file: $ref"
done < <(grep -o 'hooks/[a-z-]*\.mjs' hooks/hooks.json | sort -u)

# 5. Every skill dir has a SKILL.md
for d in skills/*/; do
  [ -f "$d/SKILL.md" ] || err "missing SKILL.md in $d"
done

# 6. Secret scan over tracked files
if git grep -nIE '(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-ant-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY)' -- . 2>/dev/null; then
  err "potential credential in tracked files (matches above)"
fi

find skills -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null
[ "$fail" -eq 0 ] && echo "release-check: clean" || echo "release-check: FAILED" >&2
exit "$fail"
