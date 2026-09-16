---
name: hone-voiceover-summary
description: Condense your last response into a short spoken summary and read it back out loud. Use when the user says "/hone-voiceover-summary", "summarize and read that back", "voiceover summary", or "give me the short version out loud". For the exact wording instead of a summary, use /hone-voiceover.
---

# Voiceover (summary)

Condenses your own most recent response into a short spoken-style summary, then speaks it —
local text-to-speech only (macOS `say`); nothing leaves this machine except the already-public
extracted text going to a lightweight headless model call for the condensing step itself
(same machine, developer's own `claude` auth — no third-party service). For the exact wording
instead, use `/hone-voiceover`.

## Steps

1. **Find this session's transcript.** The most-recently-modified `*.jsonl` file under
   `~/.claude/projects/<repoPath with every / replaced by ->/`, where `repoPath` is the
   current working directory (`pwd`).
   - Default voice is **`Jamie (Premium)`** (quote it exactly like that for `-v` — the space
     and parentheses are part of the voice name). If the user passed an argument (e.g.
     `/hone-voiceover-summary Daniel`), use that voice instead for this one call — it does not
     change what gets summarized.

2. **Extract and clean the raw text — no model call for this part.** Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/engine/voiceover-extract.mjs" "<transcript-path-from-step-1>"
   ```
   This finds the final text block of your own prior turn (skipping tool-call narration and
   code) and strips markdown — deterministic, zero LLM cost.
   - If it exits non-zero (no prior assistant turn yet), tell the user there's nothing to read
     back yet and stop here. Do not attempt playback.

3. **Condense it with a cheap, low-effort headless call — do not do this condensation
   yourself in the main conversation.** Write a prompt file to the scratchpad directory
   containing:
   ```
   Condense the text below into 2-4 natural spoken sentences, as if leaving a voicemail:
   the outcome, the decision made, what changed, and what's next. Stay strictly faithful to
   what the text actually says - do not add claims that aren't there. Respond with ONLY the
   summary text - no preamble, no quotes, no markdown.

   --- TEXT ---
   <output from step 2>
   --- END TEXT ---
   ```
   Then run, piping the prompt file in via stdin (never inline the extracted text into a
   shell command string — it may contain quotes/backticks):
   ```bash
   claude -p --model haiku --effort low --output-format text < "<prompt-file-path>"
   ```
   This is the one genuinely model-needed step (real condensation), deliberately pinned to
   the cheapest tier — the routing ladder's own guidance treats this kind of already-final-text
   condensation as closer to extraction than judgment, so it doesn't need a bigger model.
   - If the command errors or returns empty output, fall back to telling the user
     text-to-speech summarization failed and stop — do not silently fall back to summarizing
     it yourself in the main session (that would defeat the point of pinning the cost).

4. **Write the resulting summary to a plain `.txt` file in the scratchpad directory** (never
   the repo), e.g. `<scratchpad>/hone-voiceover-summary-<timestamp>.txt`.

5. **Check TTS is available, then speak it.**
   - Run `command -v say` first.
   - If found: run `say -v "<voice-from-step-1>" -f <path-from-step-4>` (voice is `Jamie
     (Premium)` unless the user overrode it in step 1). This blocks until playback finishes —
     expected for an explicit, on-demand action.
   - If not found (non-macOS, or a sandboxed/remote environment with no local audio device):
     tell the user plainly that local text-to-speech isn't available on this platform, and
     stop. Do not treat this as an error or retry.

6. Leave the scratchpad files where they are — no cleanup needed.
