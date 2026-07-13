---
name: plugin-vet
description: Security-scan a third-party Claude Code plugin, skill, or MCP server directory BEFORE installing or trusting it — detects invisible-Unicode / Trojan-Source prompt injection and known supply-chain IOCs. Use when the user says "vet this plugin", "is this plugin safe", "scan before install", "plugin-vet", or is about to install any third-party plugin/skill/marketplace.
---

# /plugin-vet — scan third-party agent extensions before trusting them

Two zero-dependency Node scanners ship with this plugin under `scripts/security/`. Run both against the target directory; report findings; verify each flagged hit in context before calling it malicious.

## 1. Unicode / prompt-injection scan (detect-only — never use `--write` on someone else's code)

```bash
ECC_UNICODE_SCAN_ROOT=<target-dir> node ${CLAUDE_PLUGIN_ROOT}/scripts/security/check-unicode-safety.js
```

Detects the invisible-character vectors a malicious SKILL.md or manifest would use: bidi overrides (Trojan Source, U+202A–202E / U+2066–2069), zero-width chars (U+200B–200D, U+2060, U+FEFF), and the Unicode Tag block (U+E0000–E007F — ASCII smuggling: instructions an LLM reads but a human reviewer can't see).

Triage the output: `dangerous-invisible` hits matter; bare `emoji` hits are noise. **Verify in context** before judging — U+FE0F variation selectors and ZWJ inside emoji sequences (e.g. ❤‍🔥) are benign; a ZWSP inside a doc-comment example can be a legitimate authoring trick. A bidi override or Tag-block char in a prompt/skill file is a red flag, full stop.

## 2. Supply-chain IOC scan

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/security/scan-supply-chain-iocs.js --root <target-dir> --json
```

Matches known, disclosed incidents: compromised `package@version` pairs across lockfile formats, malicious payload/persistence filenames (incl. inside `.claude/`, `.vscode/`, LaunchAgents, systemd paths), exfil domains, cloud-metadata SSRF targets, and known-bad file hashes. Periodic self-audit of the whole machine: add `--home`.

**Limitation (say it in the report):** this is a floor-check against already-known campaigns — a clean result does not clear a novel malicious plugin. Pair it with reading the plugin's hooks and scripts for anything that phones home, edits settings, or runs at session start.

## Report

One line per scanner: `clean` or the verified findings (file:line, char/IOC, benign-or-real verdict with the evidence). End with install / don't-install / install-with-caveats.
