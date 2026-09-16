#!/usr/bin/env node
// Defense-in-depth secret scrubbing before a transcript excerpt leaves this
// process for the Tier 2 `claude -p` call. Tier 2 already uses the developer's
// own auth (FR4-compliant), so this isn't a trust-boundary requirement - it's
// just good hygiene against a pasted credential surviving into a finding's
// evidence excerpt (and eventually a PR).

const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/g, // AWS access key id
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /ghp_[A-Za-z0-9]{36}/g, // GitHub PAT
    /gh[oprsu]_[A-Za-z0-9]{20,}/g, // other GitHub token prefixes
    /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT-looking
    /(?:api[_-]?key|secret[_-]?key|access[_-]?token|password|passwd)\s*[:=]\s*['"]?[A-Za-z0-9_\-/+=]{12,}['"]?/gi,
];

export function redact(text) {
    let out = text;
    for (const re of SECRET_PATTERNS) {
        out = out.replace(re, '[REDACTED]');
    }
    return out;
}
