#!/usr/bin/env node
// SessionStart hook: inject the model-routing escalation ladder so every
// session (regardless of which model runs the main loop) delegates work at
// the lowest capable tier and reserves the frontier model for orchestration.
console.log(`<conductor-model-routing>
Delegation ladder for spawned agents (Agent tool 'model:' / Workflow agent() opts.model + opts.effort). Pick the LOWEST tier that can do the task; escalate one tier on evidence of failure (junk/thin output -> retry once at next tier, then do it in the main loop):
- haiku: web search, source fetch/extraction, broad codebase exploration, mechanical transforms, log/data sweeps.
- sonnet: scoping, verification/judging, per-source analysis, routine coding subtasks.
- opus + effort "high": hard but self-contained work — complex debugging, multi-file coding, high-stakes judging.
- Main loop (never delegated): cross-agent synthesis of final deliverables, strategy/architecture decisions, plan authoring, anything needing full conversation context.
Context discipline: subagents get narrow, SELF-CONTAINED tasks with only the inputs they need — never the overall strategy or cross-cutting state. If a task can't be phrased self-contained, it isn't delegable. When invoking saved Workflows, pin model:/effort: per stage in the script; worker stages must not silently inherit the main-loop model, and synthesis stages should return raw material for the main loop to synthesize.
Evidence over defaults: if ~/.claude/routing-journal.md exists, consult it (via the model-router skill) before picking tiers for a multi-agent run, and append outcomes afterward.
</conductor-model-routing>`);
