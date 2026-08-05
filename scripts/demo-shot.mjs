#!/usr/bin/env node
// Render the docs screenshots (terminal panels) to PNG with headless Chrome.
// Content is real hook output and real report/journal rows, with local paths
// generalised. Re-run after changing hook output so the docs stay honest.
//
//   node scripts/demo-shot.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const CHROME = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].find((p) => { try { return spawnSync(p, ['--version']).status === 0; } catch { return false; } });
if (!CHROME) { console.error('no Chrome/Chromium found'); process.exit(1); }

const shell = (html, w, h) => `<!doctype html><meta charset="utf-8"><style>
:root{--bg:#12100d;--panel:#191611;--line:#2c2820;--ink:#efe9dd;--dim:#9b9385;--faint:#6b6559;
 --green:#8fbf7a;--gold:#d8ab4a;--red:#e08a72;--blue:#7fb0d8;--violet:#b79ae0}
*{box-sizing:border-box}
body{margin:0;width:${w}px;background:transparent;
 font:13.5px/1.72 ui-monospace,SFMono-Regular,"SF Mono",Menlo,monospace;color:var(--ink);padding:22px}
.term{background:var(--bg);border:1px solid var(--line);border-radius:12px;overflow:hidden;
 box-shadow:0 24px 60px -30px #000}
.tb{display:flex;align-items:center;gap:7px;padding:11px 15px;background:#1d1a15;border-bottom:1px solid var(--line)}
.tb i{width:10px;height:10px;border-radius:50%;background:#332e26;display:block}
.tb span{margin-left:10px;font-size:11.5px;color:var(--faint);letter-spacing:.04em}
.body{padding:18px 20px}
.row{white-space:pre-wrap}
.dim{color:var(--dim)} .faint{color:var(--faint)} .g{color:var(--green)} .y{color:var(--gold)}
.r{color:var(--red)} .b{color:var(--blue)} .v{color:var(--violet)} .w{color:#fff}
.hook{color:var(--violet)}
.sep{height:1px;background:var(--line);margin:15px 0}
.tag{border:1px solid var(--line);border-radius:4px;padding:0 6px;font-size:11px;color:var(--faint)}
table{border-collapse:collapse;width:100%;font-size:12.5px}
td,th{text-align:left;padding:5px 12px 5px 0;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--faint);font-weight:500;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
</style>${html}`;

const shots = [
    {
        out: 'docs/img/hooks.png', w: 900, h: 560,
        html: `<div class="term">
<div class="tb"><i></i><i></i><i></i><span>claude ~/repo/acme-api</span></div>
<div class="body">
<div class="row faint">SessionStart</div>
<div class="row"><span class="hook">&lt;conductor-model-routing&gt;</span> Delegation ladder: spawned agents run at the lowest capable tier
  (<span class="g">haiku</span> search/fetch/mechanical → <span class="y">sonnet</span> verify/scope/routine code → <span class="r">opus+high</span> hard self-contained work).
  Never delegated: synthesis, strategy, plan authoring. <span class="faint">journal at ~/.claude/routing-journal.md</span></div>
<div class="sep"></div>
<div class="row faint">PreToolUse Edit <span class="tag">once per crossing</span></div>
<div class="row"><span class="y">⚠ context 512k / 1M (51%)</span> <span class="dim">- cheapest next step: /compact at the next task boundary.</span></div>
<div class="sep"></div>
<div class="row faint">Stop <span class="tag">14 tool calls this turn</span></div>
<div class="row"><span class="b">↻ reflect</span> <span class="dim">- that was a 5+ step procedure. Draft it as a skill, or patch the skill it proved wrong.</span></div>
<div class="sep"></div>
<div class="row faint">Stop <span class="tag">goal contract active</span></div>
<div class="row"><span class="r">✗ 2 of 5 completion criteria unchecked</span> <span class="dim">- reopen the contract and check boxes only against pasted evidence.</span></div>
<div class="sep"></div>
<div class="row faint">SessionStart <span class="tag">healthy</span></div>
<div class="row dim">conductor-doctor: <span class="g">silent</span></div>
</div></div>`,
    },
    {
        out: 'docs/img/doctor.png', w: 900, h: 420,
        html: `<div class="term">
<div class="tb"><i></i><i></i><i></i><span>~/.claude/conductor-report.md</span></div>
<div class="body">
<div class="row"><span class="w"># conductor watcher report</span></div>
<div class="sep"></div>
<div class="row"><span class="r">## [OPEN] skill-shadow</span></div>
<div class="row dim">a personal copy shadows a bundled plugin skill without declaring divergence - both load
every session; delete the copy or note the divergence in its SKILL.md</div>
<div class="row faint">first-seen: 2026-08-04 · last-seen: 2026-08-05 · issue: #14</div>
<div class="sep"></div>
<div class="row"><span class="g">## [RESOLVED] double-install</span></div>
<div class="row dim">conductor hooks were registered BOTH via the plugin and directly in settings.json -
they fired twice per event</div>
<div class="row faint">first-seen: 2026-07-10 · resolved: 2026-07-10 · closed #3</div>
<div class="sep"></div>
<div class="row"><span class="g">## [RESOLVED] hooks-json</span></div>
<div class="row dim">hooks.json missing, unparseable, or referencing a script that is not there</div>
<div class="row faint">first-seen: 2026-07-10 · resolved: 2026-07-28</div>
<div class="sep" style="margin-top:17px"></div>
<div class="row faint">the same entry is rewritten in place, never duplicated - a passing check is the only definition of fixed</div>
</div></div>`,
    },
    {
        out: 'docs/img/journal.png', w: 980, h: 400,
        html: `<div class="term">
<div class="tb"><i></i><i></i><i></i><span>~/.claude/routing-journal.md - evidence, not defaults</span></div>
<div class="body">
<table>
<tr><th>date</th><th>task kind</th><th>model</th><th>n</th><th>outcome</th><th>note</th></tr>
<tr><td class="faint">2026-07-10</td><td>web-search</td><td class="g">haiku</td><td>5</td><td class="g">clean</td><td class="dim">4-6 relevant results each, structured output</td></tr>
<tr><td class="faint">2026-07-10</td><td>web-fetch-extract</td><td class="g">haiku</td><td>20</td><td class="g">clean</td><td class="dim">95 falsifiable claims w/ quotes, 0 agent errors</td></tr>
<tr><td class="faint">2026-07-10</td><td>scope-decomposition</td><td class="y">sonnet</td><td>1</td><td class="g">clean</td><td class="dim">5 well-differentiated search angles</td></tr>
<tr><td class="faint">2026-07-10</td><td>adversarial-verify</td><td class="y">sonnet</td><td>75</td><td class="g">clean</td><td class="dim">25 claims x 3 votes; killed a fabricated claim 0-3</td></tr>
<tr><td class="faint">2026-07-10</td><td>cross-agent-synthesis</td><td class="y">sonnet</td><td>1</td><td class="r">FAILED</td><td class="dim">returned a literal placeholder for the final report</td></tr>
<tr><td class="faint">2026-07-10</td><td>file-restructure</td><td class="y">sonnet</td><td>1</td><td class="g">clean</td><td class="dim">split a 165-line CLAUDE.md into 12 rule files, byte-exact</td></tr>
</table>
<div class="sep"></div>
<div class="row dim">one FAILED row is why <span class="w">cross-agent-synthesis</span> never leaves the main loop.</div>
</div></div>`,
    },
];

mkdirSync('docs/img', { recursive: true });
for (const s of shots) {
    const tmp = `/tmp/conductor-shot-${s.out.replace(/\W/g, '_')}.html`;
    writeFileSync(tmp, shell(s.html, s.w, s.h));
    const r = spawnSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
        '--disable-sync', '--disable-component-update', `--user-data-dir=/tmp/shot-${Date.now()}`,
        '--default-background-color=00000000', '--force-device-scale-factor=1.5',
        `--window-size=${s.w},${s.h}`, '--virtual-time-budget=2000',
        `--screenshot=${s.out}`, `file://${tmp}`,
    ], { stdio: 'ignore', timeout: 90_000 });
    console.log(r.status === 0 ? `wrote ${s.out}` : `failed ${s.out}`);
}
