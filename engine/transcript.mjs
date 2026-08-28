#!/usr/bin/env node
// Parses a Claude Code session transcript (JSONL) into a normalized turn list.
// Tolerant of unknown record types and partial/foreign lines - transcript format
// is not a stable public contract, so every step here degrades to "skip this
// record" rather than throwing.
//
// WIDENED 2026-08-28. The previous parser kept {role, timestamp, text,
// toolUses:[{name,id,filePath}], model, effort} and dropped everything else -
// roughly 90% of the record volume, including the exact fields needed to say
// anything about how work was actually done:
//
//   - Agent/Task input      what was delegated, to whom, at what model
//   - ExitPlanMode input    the plan text itself (plan mode was a boolean)
//   - message.usage         token accounting (on every assistant record)
//   - promptSource          typed vs system vs sdk vs queued
//   - thinking blocks       more numerous than text blocks in a real corpus
//   - gitBranch             arc-builder re-parses raw JSONL just to get this
//   - pr-link records       a first-party sessionId -> PR join
//   - system:turn_duration  wall-clock ms per turn
//
// This is an EXTENSION, not a rewrite: every field the old parser produced is
// still produced with identical semantics. See parseSession() for the
// session-level records that are not turns.
import { readFileSync } from 'node:fs';

// Tool inputs can carry entire file contents (Write.content). Cap each string
// so a corpus walk cannot blow up memory, but keep it generous enough that
// plan text and delegated prompts survive intact.
const MAX_INPUT_STR = Number(process.env.HONE_MAX_INPUT_STR || 8000);

function capStrings(value, depth = 0) {
    if (depth > 6) return null;
    if (typeof value === 'string') {
        return value.length > MAX_INPUT_STR ? `${value.slice(0, MAX_INPUT_STR)}…[truncated]` : value;
    }
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => capStrings(v, depth + 1));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = capStrings(v, depth + 1);
        return out;
    }
    return value;
}

// Pull the few input fields worth naming explicitly, so callers don't each
// re-derive them. Everything else stays available on `input`.
function describeToolUse(name, input) {
    const d = {};
    if (!input || typeof input !== 'object') return d;
    // Which file an edit touched - the one field the old parser did keep.
    d.filePath = input.file_path || input.notebook_path || null;
    if (name === 'Agent' || name === 'Task') {
        d.subagentType = input.subagent_type || null;
        d.delegatedPrompt = input.prompt || null;
        d.delegatedModel = input.model || null;
        d.description = input.description || null;
    } else if (name === 'ExitPlanMode') {
        d.plan = input.plan || null;
        d.planFilePath = input.planFilePath || null;
    } else if (name === 'Bash') {
        d.command = input.command || null;
        d.runInBackground = input.run_in_background === true;
    } else if (name === 'Skill') {
        d.skill = input.skill || null;
    }
    return d;
}

function extractBlocks(content) {
    // content: string | array of Anthropic-message-shape content blocks
    if (typeof content === 'string') {
        return { text: content, toolUses: [], toolResults: [], thinking: '', hasText: content.trim().length > 0 };
    }
    if (!Array.isArray(content)) {
        return { text: '', toolUses: [], toolResults: [], thinking: '', hasText: false };
    }

    const textParts = [];
    const thinkingParts = [];
    const toolUses = [];
    const toolResults = [];
    for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text);
        } else if (block.type === 'tool_use') {
            const input = capStrings(block.input);
            toolUses.push({
                name: block.name,
                id: block.id,
                // filePath stays a top-level field for backwards compatibility -
                // heuristics.mjs and arc-builder.mjs both read u.filePath.
                ...describeToolUse(block.name, block.input),
                input,
            });
        } else if (block.type === 'tool_result') {
            toolResults.push({ toolUseId: block.tool_use_id, isError: block.is_error === true });
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
            thinkingParts.push(block.thinking);
        }
    }
    return {
        text: textParts.join('\n'),
        toolUses,
        toolResults,
        thinking: thinkingParts.join('\n'),
        hasText: textParts.join('').trim().length > 0,
    };
}

// Which promptSource values represent a human actually typing something.
// 'system' is injected context, 'sdk' is programmatic.
const HUMAN_PROMPT_SOURCES = new Set(['typed', 'queued', 'suggestion_accepted']);

export function parseTranscript(transcriptPath) {
    return parseSession(transcriptPath).turns;
}

// Full parse: turns plus the session-level records that are not turns.
export function parseSession(transcriptPath) {
    const data = readFileSync(transcriptPath, 'utf8');
    const turns = [];
    const meta = {
        sessionId: null,
        cwd: null,
        version: null,
        gitBranches: [],
        aiTitle: null,
        customTitle: null,
        prLinks: [],
        turnDurations: [],
        compactBoundaries: [],
        firstTimestamp: null,
        lastTimestamp: null,
        recordTypeCounts: {},
    };
    const branches = new Set();

    for (const line of data.split('\n')) {
        if (!line.trim()) continue;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            continue; // partial/foreign line - tolerate, keep scanning
        }

        const type = rec.type;
        meta.recordTypeCounts[type] = (meta.recordTypeCounts[type] || 0) + 1;
        if (rec.sessionId && !meta.sessionId) meta.sessionId = rec.sessionId;
        if (rec.cwd && !meta.cwd) meta.cwd = rec.cwd;
        if (rec.version && !meta.version) meta.version = rec.version;
        if (rec.gitBranch) branches.add(rec.gitBranch);
        if (rec.timestamp) {
            if (!meta.firstTimestamp || rec.timestamp < meta.firstTimestamp) meta.firstTimestamp = rec.timestamp;
            if (!meta.lastTimestamp || rec.timestamp > meta.lastTimestamp) meta.lastTimestamp = rec.timestamp;
        }

        // --- session-level records: not turns, but the highest-value joins ---
        if (type === 'pr-link') {
            meta.prLinks.push({
                sessionId: rec.sessionId || null,
                prNumber: rec.prNumber ?? null,
                prUrl: rec.prUrl || null,
                prRepository: rec.prRepository || null,
                timestamp: rec.timestamp || null,
            });
            continue;
        }
        if (type === 'ai-title' && !meta.aiTitle) {
            meta.aiTitle = rec.title || rec.aiTitle || rec.text || null;
            continue;
        }
        if (type === 'custom-title' && !meta.customTitle) {
            meta.customTitle = rec.title || rec.text || null;
            continue;
        }
        if (type === 'system') {
            if (rec.subtype === 'turn_duration') {
                meta.turnDurations.push({
                    durationMs: rec.durationMs ?? null,
                    messageCount: rec.messageCount ?? null,
                    timestamp: rec.timestamp || null,
                });
            } else if (rec.subtype === 'compact_boundary') {
                meta.compactBoundaries.push({
                    preTokens: rec.preTokens ?? null,
                    postTokens: rec.postTokens ?? null,
                    cumulativeDroppedTokens: rec.cumulativeDroppedTokens ?? null,
                    durationMs: rec.durationMs ?? null,
                    timestamp: rec.timestamp || null,
                });
            }
            continue;
        }
        if (type !== 'user' && type !== 'assistant') continue;

        const msg = rec.message;
        if (!msg || msg.content == null) continue;

        const { text, toolUses, toolResults, thinking, hasText } = extractBlocks(msg.content);
        // A real human prompt is a 'user' record carrying text that is not
        // purely relaying a tool_result back to the model.
        const isToolResultOnly = rec.type === 'user' && toolResults.length > 0 && !hasText;
        const isHumanPrompt = rec.type === 'user' && !isToolResultOnly && hasText;

        turns.push({
            index: turns.length,
            role: rec.type,
            uuid: rec.uuid,
            parentUuid: rec.parentUuid ?? null,
            timestamp: rec.timestamp,
            text,
            hasText,
            // UNCHANGED SEMANTICS, deliberately. promptSource below is the
            // accurate signal, but isHumanPrompt feeds every existing heuristic
            // and the calibration re-run is a controlled before/after - silently
            // improving this field would confound the one comparison it exists
            // to make. New work should prefer isTypedByHuman.
            isHumanPrompt,
            isToolResultOnly,
            // The first-party field the heuristic above was approximating.
            // null on records that don't carry it (all assistant records).
            promptSource: rec.type === 'user' ? rec.promptSource || null : null,
            isTypedByHuman: rec.type === 'user' && HUMAN_PROMPT_SOURCES.has(rec.promptSource),
            toolUses,
            toolResults,
            thinking,
            gitBranch: rec.gitBranch || null,
            isSidechain: rec.isSidechain === true,
            // Only meaningful on assistant turns - which model/effort actually
            // ran this turn, straight from the record (rec.effort is a
            // top-level field alongside rec.message on assistant records).
            model: rec.type === 'assistant' ? msg.model || '' : '',
            effort: rec.type === 'assistant' ? rec.effort || '' : '',
            stopReason: rec.type === 'assistant' ? msg.stop_reason || null : null,
            usage: rec.type === 'assistant' && msg.usage ? msg.usage : null,
            // Structured result of the tool call this record is relaying back.
            // structuredPatch is a literal diff; userModified says whether the
            // human hand-edited the file afterwards.
            toolUseResult: summarizeToolUseResult(rec.toolUseResult),
        });
    }

    meta.gitBranches = [...branches];
    return { turns, meta };
}

// toolUseResult can be very large (whole file contents). Keep the shape and the
// signal, not the payload.
function summarizeToolUseResult(r) {
    if (!r || typeof r !== 'object') return null;
    const out = {};
    if (typeof r.type === 'string') out.type = r.type;
    if (typeof r.filePath === 'string') out.filePath = r.filePath;
    if (typeof r.userModified === 'boolean') out.userModified = r.userModified;
    if (typeof r.interrupted === 'boolean') out.interrupted = r.interrupted;
    if (Array.isArray(r.structuredPatch)) {
        out.patchHunks = r.structuredPatch.length;
        out.patchLines = r.structuredPatch.reduce((n, h) => n + (Array.isArray(h.lines) ? h.lines.length : 0), 0);
    }
    if (typeof r.stdout === 'string') out.stdoutLen = r.stdout.length;
    if (typeof r.stderr === 'string') out.stderrLen = r.stderr.length;
    return Object.keys(out).length ? out : null;
}

// Builds a redaction-ready text excerpt of turns[anchorIndex-radius .. +radius],
// collapsing tool activity to one-line summaries so the excerpt stays cheap.
export function excerptAround(turns, anchorIndex, radius = 3, maxChars = 3000) {
    const lo = Math.max(0, anchorIndex - radius);
    const hi = Math.min(turns.length - 1, anchorIndex + radius);
    const lines = [];
    for (let i = lo; i <= hi; i++) {
        const t = turns[i];
        const marker = i === anchorIndex ? '  <== FLAGGED' : '';
        if (t.isToolResultOnly) {
            lines.push('[tool result returned]');
            continue;
        }
        if (t.role === 'assistant' && t.toolUses.length && !t.hasText) {
            lines.push(`[assistant used tools: ${t.toolUses.map((u) => u.name).join(', ')}]${marker}`);
            continue;
        }
        const roleLabel = t.role === 'user' ? 'developer' : 'assistant';
        const toolNote = t.toolUses.length ? ` [+ used tools: ${t.toolUses.map((u) => u.name).join(', ')}]` : '';
        lines.push(`${roleLabel}: ${t.text}${toolNote}${marker}`);
    }
    let excerpt = lines.join('\n---\n');
    if (excerpt.length > maxChars) {
        excerpt = `${excerpt.slice(0, maxChars)}\n[...excerpt truncated...]`;
    }
    return excerpt;
}
