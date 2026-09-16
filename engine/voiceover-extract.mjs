#!/usr/bin/env node
// Deterministic, model-free extraction for the voiceover skills. No `claude -p`
// call here on purpose: pulling "the final text block of the prior assistant
// turn" out of the transcript and stripping markdown/code is mechanical, so it
// costs nothing and is more faithful to "exact wording" than asking a live
// model to retype it (an LLM asked to reproduce text "verbatim" can still
// subtly reword it - a plain read of the transcript field cannot).
//
// Usage: node voiceover-extract.mjs <transcriptPath>
// Prints the cleaned text of the prior assistant turn's final text block to
// stdout and exits 0, or exits 1 with nothing on stdout if there is no prior
// assistant turn to read back (e.g. voiceover invoked as the first message).
import { parseSession } from './transcript.mjs';

function stripForSpeech(text) {
    return text
        // fenced code blocks - reading code aloud isn't useful, mark it
        .replace(/```[\s\S]*?```/g, ' code omitted. ')
        // inline code - keep the content, drop the backticks
        .replace(/`([^`]+)`/g, '$1')
        // markdown headers
        .replace(/^#{1,6}\s+/gm, '')
        // bold/italic markers
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // bullet/list markers at line start
        .replace(/^\s*[-*]\s+/gm, '')
        // table pipes
        .replace(/\|/g, ' ')
        // collapse excess blank lines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function main() {
    const transcriptPath = process.argv[2];
    if (!transcriptPath) {
        process.stderr.write('usage: voiceover-extract.mjs <transcriptPath>\n');
        process.exit(1);
    }

    const { turns } = parseSession(transcriptPath);

    // "Last hasText assistant record" is NOT enough on its own: by the time
    // this runs, the CURRENT turn (this very skill invocation) may already
    // have its own commentary text and tool-use records in the transcript -
    // running this extraction is itself a Bash tool call, and any text this
    // turn wrote before that call is a real hasText assistant record too. We
    // need the boundary marking where THIS invocation started, and take the
    // last hasText assistant record strictly before it - not just the last
    // one in the file.
    //
    // A skill invocation (e.g. this one) appends a 'user' record whose text
    // starts with "<command-message>" - unambiguous, content-anchored, so we
    // don't have to infer the boundary from role-sequence patterns (which
    // break once tool-result 'user' records and commentary 'assistant'
    // records from the current turn's own work start interleaving). Anchor
    // on the LAST such marker if one exists; otherwise (a plain typed
    // message or natural-language trigger, no literal /command) fall back
    // to the last human-typed user turn.
    let boundary = -1;
    for (let i = turns.length - 1; i >= 0; i--) {
        if (turns[i].role === 'user' && turns[i].text.startsWith('<command-message>')) {
            boundary = i;
            break;
        }
    }
    if (boundary === -1) {
        for (let i = turns.length - 1; i >= 0; i--) {
            if (turns[i].role === 'user' && turns[i].isHumanPrompt) {
                boundary = i;
                break;
            }
        }
    }
    if (boundary === -1) process.exit(1); // no invocation boundary found - shouldn't happen

    let target = null;
    for (let i = boundary - 1; i >= 0; i--) {
        if (turns[i].role === 'assistant' && turns[i].hasText) {
            target = turns[i];
            break;
        }
    }
    if (!target) process.exit(1); // nothing to read back yet (e.g. first message in session)

    process.stdout.write(stripForSpeech(target.text));
}

main();
