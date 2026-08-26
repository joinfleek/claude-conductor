# Hone — the whole exercise, in one read

**19–26 August 2026 · eight developers · nine runs · two repos**

This is the read-through version. The working notes are in [`README.md`](README.md) and the
per-developer detail is in [`developer-runs/`](developer-runs/); this file is the summary you can
read start to finish without holding nine other documents in your head.

---

## 1. Summary

We built a local tool called **Hone** that reads a developer's own Claude Code session history on
their own machine and tries to spot where working with the AI went badly — so that the friction
turns into a fix to the harness (a rule, a skill, a hook) instead of being forgotten. Nothing
leaves the machine until a human approves it. Over eight days, eight engineers ran it across our
frontend and backend repos, producing nine runs and about 400 sessions of real history.

**The honest verdict: the machinery works, the measurements were mostly wrong, and the tool has
not yet been tested on the only question that matters.** Hone reliably finds one category of
problem — the AI taking a consequential action without asking, or claiming something it didn't
verify — and it found that category independently across three developers and both repos. It does
*not* yet measure the thing the project was started for ("it takes too much prompting to get a
feature right"). Along the way the exercise generated several confident numbers that turned out to
be artefacts of our own bugs, and each was caught only because someone read the raw output instead
of the summary. Nothing has yet gone through the final review gate, so we still cannot say whether
a single finding is worth a reviewer's time.

---

## 2. What we improved along the way

These are changes we made to Hone *during* the exercise, each because the data showed something
was broken. Roughly in order of how much they mattered.

**The parser was throwing away the evidence.** Hone recorded *that* a file was edited but not
*which* file. That one omission meant the tool could only measure the shape of the conversation,
never the work. Keeping the filename — a one-line change — is what made everything below
possible.

**Three new checks: rework, scope drift, and iteration count.** With filenames available we added
checks for the same file being edited over and over, for files being changed that the developer
never mentioned, and for sessions with an unusually high number of back-and-forth turns. These
were meant to capture the two complaints engineers actually voice. They partly do.

**We were telling the AI judge what to find.** The prompt that asks the AI to assess a session was
leaking our own check names into it, plus a worked example of a "good" answer. The judge dutifully
wrote that answer back. A pattern we had spent three days treating as a discovery about our
codebase was substantially manufactured by our own prompt. Removing it is the single biggest
correctness fix of the exercise, and we have direct proof it worked — see Yash below.

**Repo identity from the git remote, not the folder name.** One engineer's checkout was in a
folder called `fe-apps`. The tool would have worked right up to the moment he approved a
finding, then crashed. Now it asks git what the repo is.

**Three fixes to the post-merge rework measurement.** Each one was inflating or hiding the
headline number: merged branches reported zero changed files, a squash-merge counted as its own
follow-up fix, and auto-generated files made unrelated commits look related.

**Reports now save as they go.** The model-comparison tool wrote its report only at the very end,
so stopping it at a time limit threw away everything it had already done. One engineer lost a
145-session run that way.

---

## 3. Everyone who ran it

Short, plain, one block each. What they ran, what came out, and what their run taught us that no
other run did.

### Yugal — frontend — 19 Aug
The first real run, on 11 sessions. It flagged 10 of them and produced nothing genuinely useful.
The conclusion at the time was "this isn't working." That conclusion was wrong, but for an
interesting reason: 11 sessions is far too small a sample to tell. It also produced the exercise's
most memorable false alarm — a file edited 49 times that looked like heavy rework turned out to be
a scratch HTML page on the Desktop, not repo code at all.

### Lenvin — frontend — 21 Aug
17 sessions. Most of what came back was the same complaint restated five times. This is where we
concluded "the tool only measures cost and routing, not prompting quality" — also wrong, and
generalised from one engineer whose work that fortnight was incident triage rather than building
features. His run did catch a real crash-in-waiting: his checkout folder had an unusual name and
the tool would have failed at the exact moment he tried to approve something.

### Yash — frontend — 24 Aug, before the fix
The biggest run so far, 37 sessions, and the first to produce genuinely useful results — a
constraint that keeps getting violated because nothing enforces it, an AI bypassing a safety check
without asking, a design document asserting a feature exists when it doesn't. But 9 of its 17
findings were the same "should have delegated this" complaint reworded. That was our contaminated
prompt talking to itself, though we didn't know it yet.

### Yash again — frontend — 24 Aug, after the fix
**The most important run of the exercise.** Same person, same repo, same sessions — only the tool
changed. The repeated complaint went from 9 occurrences to **zero**, and the proportion of
findings that were genuinely distinct went from about half to about three-quarters. Because
nothing but the engine varied, this is the closest thing we have to a controlled experiment, and
it's what turned "we think the prompt was contaminating results" into something we know.

He also spotted that the three sessions with the *heaviest* rework got "nothing to report" from
all three AI models — the tool is finding exactly the sessions it was built to find and then
discarding them.

### Aarushi — backend — 24 Aug
The first backend run and the largest at the time: 104 sessions. Her most useful contribution was
negative — the expensive check never finished, and no follow-up ever came, so the backend has no
AI-judged findings from this period at all. Everything we later proposed for the backend had to be
grounded in git history instead. She also showed that backend work looks nothing like frontend
work: files there are routinely edited 15–30 times in normal migration work, where 7 was the high
end on the frontend.

### Kishan — frontend — 24 Aug
59 sessions across four separate checkouts. Every one of his 23 findings was distinct — more
confirmation the prompt fix worked. His run produced **the single best finding of the whole
exercise**: a secret pasted into a session and left sitting in two files on disk. That's the same
thing we'd caught once before, on a different person's machine, weeks earlier — the only finding
anywhere that has recurred independently across people.

### Abhishek — frontend — 24 Aug
The largest corpus, 145 sessions, and the most damaged run — which made it one of the most useful.
Two of his four checks broke, and both breakages taught us more than clean results would have. His
GitHub login had silently expired, and instead of saying so the tool reported "no pull requests
found" for every branch he'd shipped that week — a confident, wrong, plausible-looking answer. And
his expensive check hit the time limit and lost everything, which is how we found the
save-as-you-go bug.

He also made the sharpest conceptual point of the exercise: **"the AI caused rework" and "a safety
gate did its job" are different things, and Hone can't tell them apart.** Both of his flagged
sessions were a branch-naming rule correctly refusing a bad branch name.

### Sampada — backend — 26 Aug
The only run where all four checks completed, on the smallest corpus (19 sessions). Sparse results
— two findings from thirty AI calls — which is itself a useful contrast with Aarushi's 104.

She found two bugs by reading her own numbers skeptically. The rework measurement was counting
edits made in *completely different folders* on her machine and attributing them to one branch.
And she noticed a branch that merged in May showing up in a "last 45 days" window — which traced
back to the tool sorting sessions by when the file was last *touched* rather than when the work
happened. That one affects every number in every run.

Her run also gave the cleanest evidence on a question we'd been going round on: one session had a
design document edited 60 times and a source file edited 59 times. No single threshold can
separate those two. A rule about *what kind of file it is* separates them instantly.

### Aastha — backend — 26 Aug
The newest run, all four checks complete, 44 sessions. She found the cause of Abhishek's mystery —
a stale GitHub token overriding his login — in one pass.

She also caught the tool making a **flatly false statement**. On one branch it printed "no fix or
revert commits — the follow-on activity was extension or maintenance, not defect repair." The only
follow-on commit was a revert *of that exact branch*. The tool doesn't recognise the word
"Revert", so the count was zero, so it produced a confident all-clear.

And she raised the one open question that could undo a lot of the above: our reports print
"no finding (or the call failed)" as a single message, so we cannot tell a model that judged a
session clean from a model whose call simply broke. We have been comparing models across nine runs
on numbers that might partly be failure rates. **We've asked her and Sampada to check — the
information is already in their logs.**

---

## 4. The checks, what they found, and what it all adds up to

### 4a. Every check, and whether it earns its place

| Check | What it looks for | Verdict |
|---|---|---|
| **A** repeated prompt | The same question asked twice in a row | Under-fires; misses duplicates that aren't back-to-back. Kept because it's nearly free |
| **B** correction language | Phrases like "no", "that's wrong", "undo that" | **Broken both ways.** Fires on "no idea" and "no problem"; misses "not what I asked for" and "one liner very easy answer". Kept only because it's nearly free |
| **C** high tool volume | Lots of tool calls, no planning step | Fires on ~95% of sessions. Not a filter |
| **D** no delegation | Expensive model doing mechanical work itself | Real, but was hugely over-counted by our own prompt bug |
| **E** file rework | Same file edited 4+ times | Mostly finds documents being drafted. Needs a rule about file type, not a bigger number |
| **F** scope drift | Files changed that you never mentioned | **The most selective check we have** — 1 to 7 sessions per run |
| **G** high iteration | 25+ of your own messages in one session | Noisy on backend work |

A and B are deliberately kept but demoted — they're cheap enough to leave in and no longer steer
anything.

### 4b. What was the same for every developer

- **The first stage doesn't filter.** It passed 74–91% of sessions through to the paid stage on
  every corpus, without exception. Adding the three new checks didn't change this.
- **Documents get mistaken for rework.** Four of four corpora showed design docs and plans at the
  top of the file-rework list — one at 42 edits, one at 60.
- **The same three measurement bugs recurred** across different people and both repos: edits from
  other folders counted against a branch, commit counts disagreeing with edit counts, and
  follow-up work attributed by "touched the same file" rather than "actually caused by this."
- **Two findings recurred across people.** A secret pasted into a session (two developers), and
  the AI bypassing a safety gate without asking (three developers, both repos). Everything else
  appeared once.

### 4c. What was different between developers

- **Model results invert completely.** On the same repo, same engine, the mid-tier model flagged
  42% of one engineer's sessions and 6% of another's. The cheap model did the reverse.
- **Yield scales with corpus size.** 11 sessions produced nothing usable; 37 and 59 produced real
  findings. The early "this doesn't work" verdict was a sample-size problem.
- **Backend and frontend have different normal.** 15–30 edits to one file is routine backend
  migration work and would be alarming on the frontend. A single threshold can't serve both.
- **Work profile decides what you find.** Incident triage, feature building and migration work
  produce completely different session shapes, and the tool has no notion of this.

### 4d. First stage vs second stage

The first stage is deterministic, free, and runs on everything. The second stage is one AI call
per session and does all the actual discrimination.

**The first stage is a hard ceiling on the whole system** — the second stage can only ever refine
what the first stage passed, never recover what it dropped. Right now that ceiling is barely a
ceiling: it lets nearly everything through, so we pay for AI calls on almost every session and get
no filtering benefit.

Aastha put the consequence best: our check for *false negatives* only examines sessions the first
stage rejected — and since it rejects so few, that audit has never had more than a handful of
sessions to look at. **The audit is starved by design.** The fix is upstream, in the two checks
that fire on almost everything.

### 4e. What we ran, and what came back

Four checks, run by each developer against their own history: the free heuristics pass, the
feature-arc reconstruction from git, the three-model comparison, and the false-negative audit.

- **Nine runs, ~400 sessions, two repos, eight people, eight days.**
- **Findings that were real and specific:** roughly a dozen. The strongest are the secret in a
  session file, gate-bypass without asking, an unenforced data constraint that kept being
  violated, and a design doc asserting a feature that didn't exist.
- **Findings that recurred across people:** two.
- **Findings that reached a code reviewer:** **zero, until three PRs were raised on the backend
  last week — and those were grounded in git history, not in Hone's own findings.**
- **Bugs found in Hone itself:** twenty. **Eleven fixed, nine still open** — two of those left
  open deliberately (checks A and B), seven genuinely outstanding.

That last line is worth sitting with. **The exercise found nearly twice as many defects in the
measuring instrument as it found findings in the thing being measured.** That is not a failure —
it is what calibration is for, and finding them took eight developers eight days. But it does mean
every number produced before 26 August was measured with an instrument we now know was faulty in
at least seven ways.

### 4f. What to measure from here

Flag counts are the wrong yardstick and we should stop quoting them. Better measures, in order of
how much they'd actually tell us:

1. **Did a code owner merge it?** Nothing has been through the review gate yet. "A model wrote a
   plausible suggestion" is not "a reviewer agreed." This is the only measure that settles whether
   the tool is useful, and it is the one we have no data on.
2. **Is the quoted correction real?** When the AI says the developer corrected it, check whether
   those words appear in the transcript. We already have one case where a model invented the quote
   and rated itself highly confident. This is mechanical and needs no new runs.
3. **Do models agree?** Findings confirmed by two or three models were consistently the good ones.
   Use it as a confidence label — not as a gate, since on one corpus it would have kept only 9%.
4. **Rework attributed by line, not by file.** When we hand-checked 13 "rework" commits, only 5
   were genuinely caused by the work they were blamed on. Any rework number we publish should use
   `git blame`, or it will be about half wrong.
5. **Distinct findings per run, not total findings.** This is the measure that actually responded
   when we fixed the prompt — from roughly half to roughly three-quarters.

### Appendix — the twenty bugs, so the count above is checkable

| # | Bug | Found by | Status |
|---|---|---|---|
| 1 | Parser discarded the edited filename | Yugal | fixed |
| 2 | Tier 2 prompt leaked our own check names to the judge | Yash (run 3) | fixed |
| 3 | Removing that over-corrected — judge lost session-scale facts | Yugal | fixed |
| 4 | Repo identity taken from folder name | Lenvin | fixed |
| 5 | Merged branches reported zero changed files | Yugal | fixed |
| 6 | Squash-merge counted as its own follow-up fix | Yugal | fixed |
| 7 | Auto-generated files created false overlap | Yugal | fixed |
| 8 | Rework check fired on Desktop scratch files | Yugal | fixed |
| 9 | Anchors landed on contentless edit turns | Yugal | fixed |
| 10 | Checkpoint safety net never persisted its state | Yugal | fixed |
| 11 | Model comparison wrote its report only at the end | Abhishek | fixed |
| 12 | Correction check fires on "no idea", misses real corrections | Yugal | **open — deliberate** |
| 13 | Repeat-prompt check only sees back-to-back messages | Aarushi | **open — deliberate** |
| 14 | Rework counts edits from other folders on the same machine | Sampada | **open** |
| 15 | Time windows filter on file timestamp, not session date | Sampada | **open** |
| 16 | Expired GitHub login silently mislabels every branch | Abhishek / Aastha | **open** |
| 17 | "Revert" and non-standard fix titles not counted as rework | Aastha | **open** |
| 18 | Report can't distinguish a clean judgment from a failed call | Aastha | **open** |
| 19 | Rework detail never printed in the report that computes it | Yash / Sampada | **open** |
| 20 | Commit counts disagree with edit counts on some branches | Abhishek / Sampada | **open, undiagnosed** |

Worth noting who found what: **items 14–20 were all found by developers running it on their own
history, not by us testing it.** Seven of the nine open bugs surfaced in the last three days of
the exercise, as more people ran it. That rate has not levelled off.
