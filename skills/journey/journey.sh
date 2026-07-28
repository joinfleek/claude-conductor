#!/bin/bash
# Timeline of everything this Claude install has learned: memories, rules,
# skills, drafts, patches, goal contracts. Newest first. Read-only.
#
# Usage: journey.sh [days]           (default 30)
# Env:   CONDUCTOR_KNOWLEDGE_DIRS    extra roots, colon-separated (same var facts-recall uses)
set -u

DAYS="${1:-30}"
CUTOFF=$(( $(date +%s) - DAYS * 86400 ))

# BSD and GNU stat disagree on flags; pick once.
if stat -f '%m' . >/dev/null 2>&1; then STAT=(stat -f '%m %N'); else STAT=(stat -c '%Y %n'); fi

roots=(
  "$HOME/.claude/rules:rule"
  "$HOME/.claude/skills:skill"
  "$HOME/.claude/skills-drafts:draft"
  "$HOME/.claude/goal-contracts:contract"
)
# Auto-memory lives per project under ~/.claude/projects/<proj>/memory/.
for m in "$HOME"/.claude/projects/*/memory; do
  [ -d "$m" ] && roots+=("$m:memory")
done
IFS=':' read -ra extra <<< "${CONDUCTOR_KNOWLEDGE_DIRS:-}"
# ${a[@]+…}: bash 3.2 treats an empty array as unset under `set -u`.
for e in ${extra[@]+"${extra[@]}"}; do [ -n "$e" ] && [ -d "$e" ] && roots+=("$e:knowledge"); done

rows=$(
  for entry in "${roots[@]}"; do
    dir="${entry%:*}"; kind="${entry##*:}"
    [ -d "$dir" ] || continue
    while IFS= read -r f; do
      read -r mtime path <<< "$("${STAT[@]}" "$f")"
      [ "$mtime" -ge "$CUTOFF" ] || continue
      # A skill's identity is its dir; everything else is the file itself.
      # (if, not case: bash 3.2 mis-parses case patterns inside $( ).)
      if [ "$kind" = skill ] || [ "$kind" = draft ]; then
        name=$(basename "$(dirname "$path")")
      else
        name=$(basename "$path" .md)
      fi
      # Frontmatter description if present, else the first line of prose.
      desc=$(awk 'NR==1 && $0=="---" {fm=1; next}
                  fm && $0=="---" {fm=0; next}
                  fm && /^description:/ {sub(/^description: */,""); print; exit}
                  !fm && /^[A-Za-z*`#-]/ {sub(/^[#-]+ */,""); if ($0=="") next; print; exit}' "$path" 2>/dev/null | cut -c1-100)
      printf '%s\t%s\t%s\t%s\n' "$mtime" "$kind" "$name" "$desc"
    done < <(find "$dir" -name '*.md' -type f 2>/dev/null)
  done | sort -rn
)

[ -z "$rows" ] && { echo "Nothing learned in the last $DAYS days."; exit 0; }

echo "Learning timeline, last $DAYS days (newest first)"
echo
while IFS=$'\t' read -r mtime kind name desc; do
  printf '%s  %-9s %-34s %s\n' "$(date -r "$mtime" +%Y-%m-%d 2>/dev/null || date -d "@$mtime" +%Y-%m-%d)" "$kind" "$name" "$desc"
done <<< "$rows"

echo
echo "$(wc -l <<< "$rows" | tr -d ' ') entries touched in $DAYS days, by kind:"
cut -f2 <<< "$rows" | sort | uniq -c | sort -rn | sed 's/^/  /'
