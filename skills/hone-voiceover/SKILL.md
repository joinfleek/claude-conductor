---
name: hone-voiceover
description: Read your last response back out loud, word for word (no summarizing). Use when the user says "/hone-voiceover", "read that back to me", "read the exact output", "voiceover this", or "say that out loud" — but wants the exact wording, not a condensed version. For a condensed spoken summary instead, use /hone-voiceover-summary.
---

# Voiceover (verbatim)

Speaks your own most recent response back to the user, using the exact wording — not a
summary. Fully local and model-free: a small deterministic script reads the transcript
directly, so this costs no tokens and can't accidentally reword anything. Text-to-speech is
local (macOS `say`); nothing leaves this machine.

## Steps

1. **Find this session's transcript.** The most-recently-modified `*.jsonl` file under
   `~/.claude/projects/<repoPath with every / replaced by ->/`, where `repoPath` is the
   current working directory (`pwd`).
   - Default voice is **`Jamie (Premium)`** (quote it exactly like that for `-v` — the space
     and parentheses are part of the voice name). If the user passed an argument (e.g.
     `/hone-voiceover Daniel`), use that voice instead for this one call — it does not change
     what gets read.

2. **Extract and clean the text — no model call.** Run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/engine/voiceover-extract.mjs" "<transcript-path-from-step-1>"
   ```
   This finds the final text block of your own prior turn (skipping tool-call narration and
   code) and strips markdown so it reads naturally — all deterministic, zero LLM cost.
   - If it exits non-zero (no prior assistant turn yet — this is the first message in the
     session), tell the user there's nothing to read back yet and stop here. Do not attempt
     playback.

3. **Write the output to a plain `.txt` file in the scratchpad directory** (never the repo),
   e.g. `<scratchpad>/hone-voiceover-<timestamp>.txt`.

4. **Check TTS is available, then speak it.**
   - Run `command -v say` first.
   - If found: run `say -v "<voice-from-step-1>" -f <path-from-step-3>` (voice is `Jamie
     (Premium)` unless the user overrode it in step 1). This blocks until playback finishes —
     expected for an explicit, on-demand action.
   - If not found (non-macOS, or a sandboxed/remote environment with no local audio device):
     tell the user plainly that local text-to-speech isn't available on this platform, and
     stop. Do not treat this as an error or retry.

5. Leave the scratchpad file where it is — no cleanup needed.
