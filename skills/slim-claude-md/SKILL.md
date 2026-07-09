---
name: slim-claude-md
description: Restructure an oversized CLAUDE.md into a lean always-loaded pointer index plus on-demand detail files, cutting per-session token cost while keeping every rule enforceable. Use when the user says "slim down claude.md", "claude.md is too big", "split claude.md", "make claude.md use pointers", or when the claude-md-size-check hook reports the size threshold (default 150k chars) exceeded. Do NOT chunk small CLAUDE.mds proactively — below the threshold, inline content is cheaper than pointers plus on-demand reads.
---

# Slim CLAUDE.md

CLAUDE.md is loaded into every session, so its size is a per-session token tax. But naive lazy-loading breaks behavioral rules: a session that never reads the detail file can't follow "never post to Slack without approval". The fix is a two-layer split:

- **Inline (always loaded)**: one bullet per rule with a **binding 1-2 sentence essence** — strong enough that a session that never opens the detail file still cannot violate the rule.
- **Detail files (read on demand)**: the full rule text moved verbatim to `rules/<slug>.md` next to the CLAUDE.md (`~/.claude/rules/` for the global file, `.claude/rules/` for a project).

## Procedure

1. **Back up** the CLAUDE.md (`CLAUDE.md.bak-<date>`).
2. **Inventory sections.** Each `##` rule/topic section becomes one detail file `rules/<kebab-slug>.md`, content moved verbatim.
3. **Rewrite CLAUDE.md** as: any preserved header lines, then a short preamble telling sessions the one-liners are binding and to READ the linked detail file before doing work of that type, then one bullet per rule: **imperative essence** ` → details: <path>/rules/<slug>.md`.
4. **Use plain paths, never `@`-prefixed paths** — `@path` auto-imports the file content into context and defeats the entire point.
5. **Essence-quality bar**: each one-liner captures trigger + prohibition/action. Test: "if the model reads ONLY this line, can it still violate the rule badly?" If yes, strengthen the line.
6. **Verify**: every original section exists in a detail file with no content loss; the new CLAUDE.md is a fraction of the original size; no `@` imports; hard behavioral constraints (external sends, destructive ops, security) read as complete prohibitions inline.
7. **Report** the before/after line counts and the file map.

## Maintenance

New rules follow the same shape from day one: one-liner in CLAUDE.md, detail in `rules/`. If a rule's detail file would be under ~5 lines, keep it fully inline — a pointer costs more than it saves.
