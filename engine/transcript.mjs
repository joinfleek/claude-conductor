#!/usr/bin/env node
// Parses a Claude Code session transcript (JSONL) into a normalized turn list.
// Tolerant of unknown record types (attachment, mode, system, ai-title, etc.)
// and partial/foreign lines - transcript format is not a stable public contract,
// so every step here degrades to "skip this record" rather than throwing.
import { readFileSync } from 'node:fs';

function extractBlocks(content) {
    // content: string | array of Anthropic-message-shape content blocks
    if (typeof content === 'string') {
        return { text: content, toolUses: [], toolResults: [], hasText: content.trim().length > 0 };
    }
    if (!Array.isArray(content)) {
        return { text: '', toolUses: [], toolResults: [], hasText: false };
    }

    const textParts = [];
    const toolUses = [];
    const toolResults = [];
    for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text);
        } else if (block.type === 'tool_use') {
            toolUses.push({ name: block.name, id: block.id });
        } else if (block.type === 'tool_result') {
            toolResults.push({ toolUseId: block.tool_use_id });
        }
        // 'thinking' and other block types are intentionally ignored - not
        // developer-facing conversational content.
    }
    return { text: textParts.join('\n'), toolUses, toolResults, hasText: textParts.join('').trim().length > 0 };
}

export function parseTranscript(transcriptPath) {
    const data = readFileSync(transcriptPath, 'utf8');
    const turns = [];

    for (const line of data.split('\n')) {
        if (!line.trim()) continue;
        let rec;
        try {
            rec = JSON.parse(line);
        } catch {
            continue; // partial/foreign line - tolerate, keep scanning
        }
        if (rec.type !== 'user' && rec.type !== 'assistant') continue;
        const msg = rec.message;
        if (!msg || msg.content == null) continue;

        const { text, toolUses, toolResults, hasText } = extractBlocks(msg.content);
        // A real human prompt is a 'user' record carrying text that is not
        // purely relaying a tool_result back to the model.
        const isToolResultOnly = rec.type === 'user' && toolResults.length > 0 && !hasText;
        const isHumanPrompt = rec.type === 'user' && !isToolResultOnly && hasText;

        turns.push({
            index: turns.length,
            role: rec.type,
            uuid: rec.uuid,
            timestamp: rec.timestamp,
            text,
            hasText,
            isHumanPrompt,
            isToolResultOnly,
            toolUses,
            // Only meaningful on assistant turns - which model/effort actually
            // ran this turn, straight from the record (rec.effort is a
            // top-level field alongside rec.message on assistant records).
            model: rec.type === 'assistant' ? msg.model || '' : '',
            effort: rec.type === 'assistant' ? rec.effort || '' : '',
        });
    }
    return turns;
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
