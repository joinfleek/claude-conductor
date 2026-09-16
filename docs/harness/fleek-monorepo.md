<!-- Source of truth: Flotion · https://os.joinfleek.com/tools/flotion/d/fleek-monorepo-harness-improvement
     Mirrored here so the audit survives independently of Flotion.
     If the Flotion doc moves ahead, re-sync rather than editing this copy. -->

# fleek-monorepo harness improvement

_Fleek-monorepo PR-mining audit: 23 recurring defect patterns and the real AI-review resolution rate, with concrete harness fixes for each. Tracked in Linear AIE-327._

Contents · Cover & brief Priority fixes The headline number Methodology Feature → fix patterns 01 Analytics field gaps 02 Unresolved AI flags 03 LaunchDarkly mis-wiring + 12 more, and 20 minor Pure bug-fix patterns Rework & review-effectiveness Limitations & sources · fleek-monorepo  933 PRs · 6 mo + 150 PR baseline  Compiled 2026-08-23   Tracking: [AIE-327](https://linear.app/fleekapp/issue/AIE-327) (9 PRs)

AI-1b · Tech Velocity Initiative · Wave 2 + 2b

# What our own pull requests already told us

Two automated passes over fleek-monorepo's real merge history — every feature that needed a follow-up fix, every standalone bug fix, and what happened when AI review actually caught something before merge. Read together, they point at a short list of harness changes, not a list of people.

**Why this exists:** the goal was never a scoreboard of who broke what. It's to find the _class_ of mistake that keeps recurring across independent PRs and independent developers, and turn each one into something the harness catches mechanically — a rule, a lint check, or a merge gate — instead of something a human has to remember every time.

933 · PRs merged, 6 mo

527 · PRs deep-read (83%)

23 · Recurring patterns found

33% · Critical AI-flags fixed pre-merge

9.1% · PRs that got an @claude review

Start here

## If you fix ten things, fix these

Ranked by how many independent PRs the same mistake cost us, with the two structural gaps from the review-effectiveness analysis pinned at the top since they cut across everything below them.

1. Make a flagged Critical/Major AI-review comment block merge, not just sit there Only **33%** (arguably 24–29% on a stricter read) of Critical/Major issues `@claude` raised got fixed before merge — the rest shipped as-is, three of them re-confirmed on a second or third review pass first. A required CI check that fails on an unresolved Critical/Major heading with no reply/commit referencing it needs no new infrastructure beyond the existing comment stream. → The headline number
2. Fix the 9.1% invocation rate before fixing follow-through `@claude` only fires on an explicit mention, so 90.9% of PRs in the post-cutover sample never got a pass at all — a Critical bug that's never flagged is indistinguishable, at merge time, from one that's flagged and ignored. This is the bigger lever of the two. → Rework & review-effectiveness
3. One payload-builder function per multi-emitter analytics event 15 PRs across 4 incidents (currency, advertising ID, content ID, navigation attribution) trace to a new event field wired into the 1–3 call sites an author was looking at and never grepped across the rest of the event family. A shared `buildXEventPayload()` makes a new field a one-line change instead of an N-site find-and-replace. → Pattern FF-01
4. Two mechanical checks for LaunchDarkly experiment wiring 8 PRs, and one mechanism _recurred a documented second time_ after already costing an experiment once: deriving an arm from `.reason.kind` when the SDK never requests reasons, and defaulting an experiment flag to an arm value instead of a non-arm sentinel. Both are greppable. → Pattern FF-03
5. Codify Sentry capture vs. breadcrumb 6 fix PRs downgrade an expected, non-fatal condition from `captureException` to a breadcrumb — one GraphQL empty-response pattern alone generated ~123k noise events in 14 days. A one-line rule plus a grep-before-close habit for duplicated capture strings would have caught most of these upstream. → Pattern PBF-01
6. Lint the "No `any`" rule instead of just stating it 6 PRs, 4 distinct shapes of typed escape hatch (`any` selectors, `as unknown as` double-casts, unlinked `@ts-ignore`, untyped route params) shipped despite an explicit CLAUDE.md ban — one made every generated chat-channel name read `undefined` in production. → Pattern PBF-02
7. Enforce the Segment/`useAnalytics` ban mechanically The retired import shipped _twice_, independently, past review both times — CLAUDE.md already bans it in prose, which is exactly why prose alone isn't enough here. → Pattern FF-09
8. One canonical selector for a server-driven feature flag, always tri-state, always reset on logout The MOV/VendorCart rollout re-derived the same flag in ~15 different hooks, never reset it on logout, and defaulted "unknown" to `false` — three separate defects from one root habit, across 7 PRs. → Pattern FF-04
9. Give HomeScreen sections one shared spacing owner 7 PRs across two independently-built batches of section modules each shipped with no bottom margin, because nothing owns inter-section spacing centrally. Fixed twice, by the same one-line QA sweep. → Pattern FF-05
10. Round-trip your storage mocks, and cite evidence for any eviction cap ImpressionEngine's dedupe cap was tuned against zero measured evidence it was ever reached, and its own regression test passed against the _pre-fix_ code because the AsyncStorage mock always returned `null`. 7 PRs trace back to the same untested surface. → Pattern FF-06

The finding that cuts across everything

## AI review keeps finding real bugs. Merge doesn't care.

Wave 2 first spotted this as nine anecdotes: a real, correctly-diagnosed Critical or Major defect, flagged in review, and the PR merges anyway because the comment is advisory prose with no gate behind it. Wave 2b went back and measured the actual denominator.

### Two out of three flagged Critical/Major issues merge unaddressed

21 · PRs where @claude flagged a Critical/Major issue

7 · fixed in the same PR before merge

14 · merged with the flag still open

33.3% · resolution rate — closer to 24–29% on a stricter "actually fixed, not just touched" reading

And underneath that: only **36 of 396** post-cutover PRs (9.1%) received any `@claude` comment at all — it fires on an explicit mention, not automatically, and a 15+ PR stretch late in the sample shows zero `@claude` activity while CodeRabbit, a separate always-on bot, kept running. The risk is two layers, not one: most PRs never get an `@claude` pass in the first place, and when they do and it finds something serious, two-thirds of the time nothing changes before merge.

**What "unaddressed" looked like, concretely:**

- A plaintext-password exposure in vendor staff-member GraphQL responses ([#8463](https://github.com/joinfleek/fleek-monorepo/pull/8463)) was flagged Critical/Security across **three separate** review passes over 9 days, restated as still-open each time, and merged 12 minutes after the third reconfirmation. Per the Wave 2 audit this was still present in `main` at time of writing — `TeamMembers.apis.ts:18`, `StaffMemberForm.apis.ts:12`, `useStaffMemberForm.ts:41`.
- An inverted Apollo link chain (retry link placed _after_ the terminating http link, making retries dead code) shipped on [#8527](https://github.com/joinfleek/fleek-monorepo/pull/8527), fixed only because a later, unrelated PR ([#8546](https://github.com/joinfleek/fleek-monorepo/pull/8546)) happened to touch the same file.
- A duplicate-forced-logout Critical flag whose only follow-up commit touched an unrelated file — a Sentry breadcrumb message, not any of the three files the flag named.
- One case where the review landed **41 seconds after the PR had already merged** — no commit window existed at all, regardless of severity.
- A Critical `as any` type-safety flag counted as "addressed" in the raw data, but the diff shows the unsafe cast was wrapped in an `eslint-disable` comment rather than removed — a reminder that "touched the flagged file" is a looser bar than "fixed the flagged defect."

**Reading this fairly:** the rework metrics in the full analysis (below) do _not_ show clean evidence that AI review made developers do more self-correction — the median PR looks the same before and after. What moved is narrower and more useful: we now know the real fix-through rate for what AI review does catch, and we know most PRs never get that pass at all.

How this was built

## Methodology

Two passes, run as background multi-agent workflows directly against this repo's GitHub history. Every number below is a real count from the run — nothing sampled silently, nothing rounded up to look more complete than it was.

### Wave 2 — six-month population census

| Step | Result |
|---|---|
| PRs merged to `main`, trailing 6 months | 933 |
| Excluded as release-please automation | 296 (31.7%) |
| Human-authored population | 637 |
| Classified `feat` / `fix` / other | 251 / 241 / 145 |
| Non-conventional titles, hand-classified by diff shape | 48 (7.5%) |
| `feat` PRs checked for a downstream fix chain | 251 / 251 (100%) |
| `feat` PRs successfully chained to ≥1 fix PR | 153 (61.0%) |
| Pure bug fixes with no discoverable feature origin | 80 |
| PRs actually opened and deep-read | 527 / 637 (82.7%) |

Chain-linking used, in priority order: a shared Linear ticket ID in both titles (high confidence), then same-author + genuine file overlap in the feature's own new code (high confidence), then file-overlap-only across different authors (recorded, but weighted low confidence). ~150 raw findings came out of the deep-read pass before clustering into the patterns below.

### Wave 2b — pre/post-@claude baseline

The `@claude` review workflow was added **2026-02-10** — only 12 days before Wave 2's window starts, so that population alone couldn't show a "before" state. Wave 2b pulled a second, systematic sample from the prior ~5.6 months to build a real control group.

| Step | Result |
|---|---|
| PRs merged, 2025-08-22 → 2026-02-10 (pre-`@claude`) | 593 |
| Excluded as automation | 254 |
| Non-automation population | 339 |
| Systematic sample (every ~2.26th PR by merge date) | 150 |
| Post-`@claude` PRs reused from Wave 2's known population | 396 |

**Known asymmetry, stated plainly:** the 150 pre-era PRs are a systematic sample of a known population; the 396 post-era PRs are everything Wave 2 already had reason to deep-read (every chained feature, every linked fix, every pure bug fix) — not an equivalent random sample of the same size population. Read the pre/post comparison as "150 sampled vs. 396 selected," not as two population-matched samples. The correction-commit metric is also a mechanical proxy: it fires on ordinary multi-commit feature build-out just as readily as on a mistake being corrected, in both eras equally.

Lens A · 527 PRs deep-read

## Feature → fix patterns

A shipped feature that needed a follow-up fix is the richest signal in the whole audit — it shows exactly what review and testing missed the first time. Ranked by how many independent PRs the same underlying mistake cost.

FF · No. 01

### Analytics fields wired into some emitters of an event family, silently omitted from the rest

**analytics-instrumentation-completeness** — 15 PRs · 4 independent incidents · L1 · rule-doc

A new analytics/attribution field — a currency code, an advertising ID, a variant-level content ID, a navigation-attribution param — gets added to the 1–3 call sites the author is looking at and never grepped across the rest of the event family's emitters. The gap surfaces weeks later from a BigQuery pull or an AppsFlyer export, never from review or CI, because a missing field isn't a type error — it's an `undefined` that serializes fine.

- `getAdvertisingIdPayload()` wired into PDP/add-to-cart/purchase only; `checkout_clicked`, `complete_registration`, `first_order` sent 0% advertising_id for weeks.
- `resolveAppsFlyerContentId` assumed every checkout emitter carried a variant-level `products[]` array; MOV vendor-cart checkout only ever sent `baskets` — `af_content_id` missing on ~60% of iOS checkout events for 1–2 weeks.
- `creation_method`/`source_product_id` duplicated as inline object literals across 4 call sites instead of one builder.
- Media-upload identifiers bolted onto an already-shipped event by three separate follow-up PRs instead of at the point the event was defined.
- 21 in-app navigation call sites, plus every deeplink/push entry point, omitted attribution fields because the shared nav helper made them optional-by-type — a chronic ~20% NULL rate across 60 days / 3.37M events.

Recommended harness changeFor any analytics/Sentry event fired from more than one call site, require a single pure payload-builder function (`buildXEventPayload(...)`) imported by every call site — a new field becomes a one-line change instead of an N-site find-and-replace. Where a field is genuinely required on every emitter, make it a non-optional parameter, not optional-with-a-lint-guard-added-after-the-incident.

[#9529](https://github.com/joinfleek/fleek-monorepo/pull/9529) [#9534](https://github.com/joinfleek/fleek-monorepo/pull/9534) [#9550](https://github.com/joinfleek/fleek-monorepo/pull/9550) [#9634](https://github.com/joinfleek/fleek-monorepo/pull/9634) [#9559](https://github.com/joinfleek/fleek-monorepo/pull/9559) [#9624](https://github.com/joinfleek/fleek-monorepo/pull/9624) [#9654](https://github.com/joinfleek/fleek-monorepo/pull/9654) [#9719](https://github.com/joinfleek/fleek-monorepo/pull/9719) [#9330](https://github.com/joinfleek/fleek-monorepo/pull/9330) [#9418](https://github.com/joinfleek/fleek-monorepo/pull/9418) [#9460](https://github.com/joinfleek/fleek-monorepo/pull/9460) [#9400](https://github.com/joinfleek/fleek-monorepo/pull/9400) [#9413](https://github.com/joinfleek/fleek-monorepo/pull/9413) [#8746](https://github.com/joinfleek/fleek-monorepo/pull/8746) [#8902](https://github.com/joinfleek/fleek-monorepo/pull/8902)

FF · No. 02

### Unresolved Critical/Major AI-review findings merged without a fix or a reply

**review-gate-not-enforced** — 13 PRs · 9 incidents · R · coderabbit-instruction, escalate to L2/L3

See the headline section above for the full breakdown, real denominator, and concrete examples — this is the single most-repeated shape in the whole audit.

Recommended harness changeTreat any CodeRabbit or `@claude` comment tagged Critical/Major as blocking merge unless a human reviewer explicitly dismisses it in-thread with a stated reason. Minimum viable version: a required CI status check that parses the latest review comment for an unresolved Critical/Major heading and fails if no subsequent commit or reply references it. Separately, harden the `@claude` Action itself — it can silently fail with a placeholder "I'll get back to you," no retry, no visible failure status.

[#9644](https://github.com/joinfleek/fleek-monorepo/pull/9644) [#9722](https://github.com/joinfleek/fleek-monorepo/pull/9722) [#9595](https://github.com/joinfleek/fleek-monorepo/pull/9595) [#9687](https://github.com/joinfleek/fleek-monorepo/pull/9687) [#9688](https://github.com/joinfleek/fleek-monorepo/pull/9688) [#8569](https://github.com/joinfleek/fleek-monorepo/pull/8569) [#8647](https://github.com/joinfleek/fleek-monorepo/pull/8647) [#8527](https://github.com/joinfleek/fleek-monorepo/pull/8527) [#8546](https://github.com/joinfleek/fleek-monorepo/pull/8546) [#8463](https://github.com/joinfleek/fleek-monorepo/pull/8463) [#8329](https://github.com/joinfleek/fleek-monorepo/pull/8329) [#8523](https://github.com/joinfleek/fleek-monorepo/pull/8523) [#8614](https://github.com/joinfleek/fleek-monorepo/pull/8614)

FF · No. 03

### LaunchDarkly experiment arm/default mis-instrumentation

**feature-flag-experiment-instrumentation** — 8 PRs · 2 mechanisms, one a documented repeat · L3 · pre-commit check

Two distinct but related LD-experiment footguns, both silent — no crash, no lint failure, just an unusable dataset.

- **Deriving the arm from `variationDetail(...).reason.kind`** instead of the variation payload. The shared client never constructs the SDK with `withReasons: true`, so `.reason` is always `undefined` in production — one banner arm read `'unresolved'` on 100% of 62,708 events over 5 days. The fix PR's own text: _"Reason-derived logic was also failure #2 of the 2026-04-27 welcome-screen incident"_ — the exact same mistake had already cost one experiment before this one.
- **Defaulting an experiment flag to an arm value** instead of a non-arm sentinel, mis-bucketing every cold-LD user into that arm. Recurred independently in the welcome-screen redesign (undercounted true signups ~8–10×) and the SearchV4 rollout.

Recommended harness changeThe prose fix already lives in `libs/docs/feature_flag_best_practices.md` — but a doc-only fix already failed to prevent a second occurrence once. Extend `tools/feature-flag-lint` (already enforced pre-commit + CI) with two mechanical checks: flag any `.reason`/`.reason?.kind` access chained off a variation-detail hook anywhere in the monorepo, and flag any boolean/string-variation default argument that is a known LD arm string rather than the project's non-arm sentinel.

[#9605](https://github.com/joinfleek/fleek-monorepo/pull/9605) [#9650](https://github.com/joinfleek/fleek-monorepo/pull/9650) [#9527](https://github.com/joinfleek/fleek-monorepo/pull/9527) [#9241](https://github.com/joinfleek/fleek-monorepo/pull/9241) [#8682](https://github.com/joinfleek/fleek-monorepo/pull/8682) [#8719](https://github.com/joinfleek/fleek-monorepo/pull/8719) [#8669](https://github.com/joinfleek/fleek-monorepo/pull/8669) [#8798](https://github.com/joinfleek/fleek-monorepo/pull/8798)

FF · No. 04

### VendorCart / MOV rollout: duplicated flag reads, no reset-on-logout, an Apollo cache-key collision

**state-management / graphql-apollo-cache** — 7 PRs · L1 · rule-doc

The MOV cart feature shipped three separate defects a single consolidation architecture would have prevented: the server-driven `enableMovCart` flag was read via a fresh `useSelector` in ~15 different hooks instead of one canonical selector; that same flag is persisted but never reset on `logoutUser`, and being a plain boolean meant "unresolved" always coded as `false` — switching accounts fired the wrong cart query, sometimes both; and a new query's result type reused the parent product's `id` across multiple distinct per-variant cart-line objects with no custom cache key, so Apollo's default normalization silently collapsed them, duplicating a rendered cart line (only "fixed" cosmetically at first by a composite React key, before the real cache-key fix landed).

Recommended harness changeA server-driven/persisted feature flag consumed by more than one hook must be read through exactly one canonical `use<Flag>Enabled()` selector. Any persist-whitelisted, account-scoped field must be reset in the `logoutUser` reducer. A boolean gating a network-request decision that can start "unknown" must be modeled tri-state, not defaulted to `false`. Any new GraphQL type where sibling objects can share a backend id for a non-uniqueness purpose needs an explicit cache-key override before merge — a duplicate-key console warning is a symptom, not proof the fix corrected the cached data.

[#8791](https://github.com/joinfleek/fleek-monorepo/pull/8791) [#8778](https://github.com/joinfleek/fleek-monorepo/pull/8778) [#8816](https://github.com/joinfleek/fleek-monorepo/pull/8816) [#8899](https://github.com/joinfleek/fleek-monorepo/pull/8899) [#8805](https://github.com/joinfleek/fleek-monorepo/pull/8805) [#9039](https://github.com/joinfleek/fleek-monorepo/pull/9039) [#8833](https://github.com/joinfleek/fleek-monorepo/pull/8833)

FF · No. 05

### HomeScreen section modules each own their own bottom spacing — recurs across independently-built siblings

**layout-consistency** — 7 PRs · 2 incidents, one QA sweep fixed both · L1 · rule-doc

Two separate batches of new HomeScreen section modules each shipped with no `marginBottom` on their outer container, because HomeScreen composes sections by rendering each module's root view directly with no shared spacing owner. Both batches were fixed by adding the identical spacing line to every affected styles file in one QA PR.

Recommended harness changeHomeScreen's composition point should own inter-section spacing centrally — a gap on the container, or a shared wrapper every new section renders inside — not each new section module. Document explicitly: new section modules must not set their own outer `marginBottom`.

[#9061](https://github.com/joinfleek/fleek-monorepo/pull/9061) [#9089](https://github.com/joinfleek/fleek-monorepo/pull/9089) [#8936](https://github.com/joinfleek/fleek-monorepo/pull/8936) [#8938](https://github.com/joinfleek/fleek-monorepo/pull/8938) [#8940](https://github.com/joinfleek/fleek-monorepo/pull/8940) [#8941](https://github.com/joinfleek/fleek-monorepo/pull/8941) [#8942](https://github.com/joinfleek/fleek-monorepo/pull/8942)

FF · No. 06

### ImpressionEngine dedupe/retry logic was wrong at the exact boundary case it existed to handle — zero test coverage of that case

**correctness / testing-gap-boundary-conditions** — 7 PRs · L1 · extends module-seam.md

A dedupe `Set` evicted its oldest key past a 10,000-entry cap — unsound, since "forgetting a key is indistinguishable from never having seen it" — and BigQuery data across 58,889 runs showed the cap was never once reached in practice (cap removed entirely rather than re-tuned). A separate persist-and-retry queue treated any exception thrown _after_ the analytics SDK had already accepted the event as a delivery failure and replayed it with no in-flight guard, turning at-least-once delivery into at-least-twice — the removed code had zero prior test coverage, and the first version of its own regression test passed against the pre-fix code too, because the AsyncStorage mock returned `null` regardless of what was written.

Recommended harness changeAny bounded `Set`/`Map` used for dedupe/idempotency needs either a comment citing measured evidence the cap is unreachable, or a non-evicting bound — never silent LRU eviction. Any test mocking a storage API for retry/persistence logic must round-trip writes to reads, never a stub that always returns empty; and any fix PR claiming a test proves a prior bug should state the test was run against the pre-fix code and shown to fail there.

[#9687](https://github.com/joinfleek/fleek-monorepo/pull/9687) [#9688](https://github.com/joinfleek/fleek-monorepo/pull/9688) [#9595](https://github.com/joinfleek/fleek-monorepo/pull/9595) [#9642](https://github.com/joinfleek/fleek-monorepo/pull/9642) [#9641](https://github.com/joinfleek/fleek-monorepo/pull/9641) [#9640](https://github.com/joinfleek/fleek-monorepo/pull/9640) [#9639](https://github.com/joinfleek/fleek-monorepo/pull/9639)

FF · No. 07

### A `useCallback([])` captures an async-resolving flag, freezing it for every later item in a queue

**stale-closure-async-state** — 4 PRs, all converging on one fix · L3 · pre-commit check

A LaunchDarkly-flag-derived boolean resolves asynchronously and defaults `false` on first render. The queue-advancing callback in the media-upload pipeline was a `useCallback([])`: video index 0 ran on a fresh closure, but every later video in the queue ran through the frozen first-render closure. Measured production impact: up to 86.4% (146/169) of multi-video draft uploads on one template never published — 282 listings stranded over 19 days, invisible because the watchdogs meant to catch it themselves depended on state the wedged item never reached.

Recommended harness changeDocument explicitly: a flag hook's boolean resolves asynchronously and returns its default on first render — any `useCallback`/`useEffect` invoked more than once per render cycle (queue processors, list callbacks) must read the flag via a ref updated every render, never the value closed over at creation. A targeted lint/grep check flagging a flag-hook result used inside a zero-dependency `useCallback` whose body is dispatched more than once per render would catch this mechanically.

**[#9430](https://github.com/joinfleek/fleek-monorepo/pull/9430)** — [#9495](https://github.com/joinfleek/fleek-monorepo/pull/9495) · [#9420](https://github.com/joinfleek/fleek-monorepo/pull/9420) · [#9390](https://github.com/joinfleek/fleek-monorepo/pull/9390)

FF · No. 08

### Enabling a Sentry native-SDK feature at 100% with no device-tier gating — happened twice, ~4 months apart

**sdk-rollout-device-tier-testing** — 4 PRs · 2 independent incidents, same mechanism · L1 · rule-doc

Sentry Session Replay was enabled flat for all devices, no memory gating, as part of an SDK-upgrade PR; six weeks later it was the #1 iOS crash source (~200+ fatal events) due to a known Sentry Cocoa SDK bug and had to be fully removed on both platforms — lowering the sample rate in the Sentry UI doesn't stop it, since the native photographer still runs. The identical shape recurred later: re-enabling profiling+replay in an SDK bump caused Android/iOS ANRs concentrated on low-memory devices (238 events / 108 users over 14 days), fixed by adding a memory-based gate mirroring a pre-existing gate for a different SDK feature.

Recommended harness changeWhen enabling a new native/third-party SDK integration that runs on every foreground/background transition, require either a staged rollout (feature flag / percentage gate, not 100% day one) or explicit low-RAM device verification as a stated PR checklist item before merge.

**[#9473](https://github.com/joinfleek/fleek-monorepo/pull/9473)** — [#9599](https://github.com/joinfleek/fleek-monorepo/pull/9599) · [#8452](https://github.com/joinfleek/fleek-monorepo/pull/8452) · [#8659](https://github.com/joinfleek/fleek-monorepo/pull/8659)

FF · No. 09

### Deprecated `useAnalytics` (Segment) import reintroduced despite an explicit CLAUDE.md ban — happened twice

**deprecated-dependency-reuse** — 4 PRs · 2 independent incidents · L3 · pre-commit check

New onboarding-screen tracking fired events through the retired Segment `useAnalytics()` hook; the new events produced zero rows over 30 days in BigQuery while sibling events using the current wrapper landed normally. The identical import shipped again independently in a different module, silently present through review, and was only removed later by an unrelated Segment-retirement effort — not by any PR in that chain.

Recommended harness changeAdd an ESLint `no-restricted-imports` rule banning the retired module path and the `useAnalytics`/`AnalyticsProvider` symbols repo-wide, wired into pre-commit + CI. The rule already exists in prose in CLAUDE.md but has zero mechanical enforcement, which is how it regressed twice.

**[#8682](https://github.com/joinfleek/fleek-monorepo/pull/8682)** — [#8714](https://github.com/joinfleek/fleek-monorepo/pull/8714) · [#8456](https://github.com/joinfleek/fleek-monorepo/pull/8456) · [#8647](https://github.com/joinfleek/fleek-monorepo/pull/8647)

FF · No. 10

### Clipboard/share calls not error-guarded before flipping the UI to "success" and firing success analytics

**silent-failure-handling** — 4 PRs, same module · L1 · rule-doc

The referral module's copy/share handlers all `await` a clipboard or share call with no try/catch, immediately followed by a success state and a success analytics event. CodeRabbit flagged both instances on the original feature PR; neither was fixed there, a third handler with the identical shape was added later, and two subsequent fix PRs touching the same file still left all three unguarded.

Recommended harness changeAny async platform call (Clipboard, Share, file I/O) that immediately drives a visible "success" UI state and a success analytics event must be wrapped so a rejection short-circuits before that state/event fires. Call this out explicitly in PR review guidance for any new copy/share handler.

**[#9588](https://github.com/joinfleek/fleek-monorepo/pull/9588)** — [#9567](https://github.com/joinfleek/fleek-monorepo/pull/9567) · [#9720](https://github.com/joinfleek/fleek-monorepo/pull/9720) · [#9722](https://github.com/joinfleek/fleek-monorepo/pull/9722)

FF · No. 11

### i18n plural key written in i18next v4 form while the app is pinned to v3 compatibility — raw key rendered to real users

**i18n-pluralization-format** — 4 PRs, one fix, one broken tool as contributing cause · L3 · pre-commit check

The customer app pins `compatibilityJSON: 'v3'`; every existing pluralized key uses the `_plural` suffix and none use the newer `_one`/`_other` form — but nothing documents this outside one config line, so a v4-trained contributor (or agent) naturally writes the wrong form. It shipped and rendered as the literal key string in production until a later PR renamed it across all 7 locales. A contributing cause: the repo's own `yarn i18n:add` tool was broken (a module-format mismatch), forcing translations to be hand-written rather than tool-generated.

Recommended harness changeAdd a check flagging any translation key ending in a v4 plural suffix as invalid given the v3 pin, and document the `_plural`-suffix convention explicitly. Separately, fix the i18n CLI's module-format mismatch — a broken generator is what pushed this onto error-prone manual editing in the first place.

**[#9722](https://github.com/joinfleek/fleek-monorepo/pull/9722)** — [#9644](https://github.com/joinfleek/fleek-monorepo/pull/9644) · [#9635](https://github.com/joinfleek/fleek-monorepo/pull/9635) · [#9523](https://github.com/joinfleek/fleek-monorepo/pull/9523)

FF · No. 12

### `SafeAreaView` the component (not the hook) applies its inset a frame late on Android

**safe-area-cls** — 3 PRs, found on one screen then generalized app-wide · L1 · mirrors android-modal-keyboard.md

First found scoped to one screen — switched to `useSafeAreaInsets()` + explicit padding on a plain view — the same author then found and fixed the same root cause holistically across ~60 files: no root `SafeAreaProvider` initial metrics, deprecated `SafeAreaView` usages, and a global route-conditional `<StatusBar>` that itself changes the top inset by toggling Android translucency per route.

Recommended harness changeFor any element visible on initial mount: use `useSafeAreaInsets()` + explicit top padding on a plain view, never the `<SafeAreaView>` component; initialize the root provider with initial metrics; own status-bar/translucency per-screen via a focus-aware hook rather than toggling it globally by route name.

**[#8800](https://github.com/joinfleek/fleek-monorepo/pull/8800)** — [#8823](https://github.com/joinfleek/fleek-monorepo/pull/8823) · [#8669](https://github.com/joinfleek/fleek-monorepo/pull/8669)

FF · No. 13

### Currency fields rendered before value + currency code are both confirmed, or hardcoded GBP in a multi-market feature

**currency-value-handling** — 3 PRs, same feature stack · L1 · rule-doc

The referral feature's reward amounts were formatted before the required data resolved, rendering a false "£0" on a partial config fetch — flagged by CodeRabbit, fixed. Separately, even the PR whose whole purpose was making rewards currency-aware still left an unconditional GBP fallback on the leaderboard currency, flagged again by CodeRabbit. A sibling hardcoded-GBP challenge config with no expiry safeguard was flagged a third time.

Recommended harness changeIntroduce a shared currency-formatting utility that returns empty/null unless both the numeric value and currency code are present, and require its use anywhere a possibly-unloaded money field is displayed. Add any bare currency-literal touching a reward/discount value as a blocking review item.

**[#9714](https://github.com/joinfleek/fleek-monorepo/pull/9714)** — [#9712](https://github.com/joinfleek/fleek-monorepo/pull/9712) · [#9701](https://github.com/joinfleek/fleek-monorepo/pull/9701)

FF · No. 14

### Bottom-sheet + text input silently fails keyboard-avoidance because the shared Input wraps a plain TextInput gorhom can't see

**bottom-sheet-keyboard-gotcha** — 3 PRs, first fix attempt didn't work · L1 · companion to android-modal-keyboard.md

The first fix attempt merged and still didn't work — the real root causes were the shared Input wrapping a bare RN `TextInput`, invisible to gorhom's focus detection, and a dynamic-sizing option that collapses the sheet when Android shrinks the window. This is the same class of bug `android-modal-keyboard.md` already documents for RN's own `<Modal>`, but that rule doesn't cover gorhom's bottom sheet, so nothing caught it on the first pass.

Recommended harness changeFor gorhom bottom sheets: any text input inside one must use the bottom-sheet-aware input component, never the bare shared Input; never combine dynamic sizing with Android's resize input mode — use fixed snap points instead.

**[#8727](https://github.com/joinfleek/fleek-monorepo/pull/8727)** — [#8901](https://github.com/joinfleek/fleek-monorepo/pull/8901) · [#8910](https://github.com/joinfleek/fleek-monorepo/pull/8910)

FF · No. 15

### Gorhom bottom-sheet "peek" bug: snap points computed against a not-yet-measured container

**recurring-bug-class** — 3 PRs to fully close one bug class · L1 · rule-doc

A fixed-pixel snap point shipped; fixed once to a percentage-of-screen-height snap point matching a pattern two other screens had already independently discovered — then still needed a second follow-up adding a negative bottom inset because a screen with variable, late-resolving content height made gorhom's layout measurement race again.

Recommended harness changeDocument the gotcha explicitly: use percentage-derived snap points, never raw pixel numbers, and set a negative bottom inset when the sheet sits inside a screen with variable/late-resolving content height.

**[#8606](https://github.com/joinfleek/fleek-monorepo/pull/8606)** — [#8627](https://github.com/joinfleek/fleek-monorepo/pull/8627) · [#8631](https://github.com/joinfleek/fleek-monorepo/pull/8631)

### Twenty more, at two supporting PRs each

Kept for completeness, not frequency-inflated — each of these is a real recurring shape, just with fewer supporting PRs than the fifteen above.

| Pattern | Category | PRs |
|---|---|---|
| A flag-driven conditional render paints the default-arm component first, then snaps to the real one — visible layout shift on every flagged user | flag-driven-conditional-render-cls | [8669](https://github.com/joinfleek/fleek-monorepo/pull/8669), [8800](https://github.com/joinfleek/fleek-monorepo/pull/8800) |
| Navigating to a screen inside the tab you're already on silently no-ops | navigation-nested-tab-noop | [9698](https://github.com/joinfleek/fleek-monorepo/pull/9698), [9728](https://github.com/joinfleek/fleek-monorepo/pull/9728) |
| Dismissing an in-app modal and firing native OS UI in the same tick races the modal's teardown — iOS analog of the documented Android modal+keyboard race | modal-teardown-native-ui-race | [9715](https://github.com/joinfleek/fleek-monorepo/pull/9715) |
| Selection/visibility state derived from only one of two parallel lists representing the same entities | derived-state-from-partial-source | [9671](https://github.com/joinfleek/fleek-monorepo/pull/9671), [9692](https://github.com/joinfleek/fleek-monorepo/pull/9692) |
| Auto-generated CLAUDE.md metadata drifts stale after a code edit — "generated, don't hand-edit" reads as "skip reviewing" | generated-doc-drift | [9567](https://github.com/joinfleek/fleek-monorepo/pull/9567), [9720](https://github.com/joinfleek/fleek-monorepo/pull/9720) |
| Sendbird's connect() only registers the push token on a genuine online connection; the "already connected offline" branch silently skips it — rediscovered 3 times | sdk-side-effect-assumption | [9543](https://github.com/joinfleek/fleek-monorepo/pull/9543), [9545](https://github.com/joinfleek/fleek-monorepo/pull/9545), [9548](https://github.com/joinfleek/fleek-monorepo/pull/9548), [9664](https://github.com/joinfleek/fleek-monorepo/pull/9664) |
| Two independently-merged PRs both add equivalent logic to the same file with no line-overlap, but a duplicate top-level declaration breaks the bundler for every app on main | concurrent-pr-collision | [9473](https://github.com/joinfleek/fleek-monorepo/pull/9473), [9492](https://github.com/joinfleek/fleek-monorepo/pull/9492) |
| A custom Expo config plugin injects native iOS wiring via exact-string anchor match, silently no-ops when the anchor doesn't match — deep links dead on iOS for a full release cycle | silent-no-op-native-injection | [8907](https://github.com/joinfleek/fleek-monorepo/pull/8907), [9402](https://github.com/joinfleek/fleek-monorepo/pull/9402) |
| A PR merges while its own required CI checks show failure, breaking install for every subsequent CI job repo-wide | ci-governance | [9499](https://github.com/joinfleek/fleek-monorepo/pull/9499), [9503](https://github.com/joinfleek/fleek-monorepo/pull/9503) |
| A registry-migration PR needs two more sequential fix PRs, each surfacing a failure only a from-scratch install or a real bundle build exercises | dependency-and-bundler-verification | [9499](https://github.com/joinfleek/fleek-monorepo/pull/9499), [9513](https://github.com/joinfleek/fleek-monorepo/pull/9513), [9515](https://github.com/joinfleek/fleek-monorepo/pull/9515) |
| A mode-toggle handler leaves a sibling field's stale, now-hidden value in place, reaching submission | stale-derived-state | [8948](https://github.com/joinfleek/fleek-monorepo/pull/8948), [9030](https://github.com/joinfleek/fleek-monorepo/pull/9030) |
| A design-token's fixed line-height, spread onto a single-line text input, vertically misaligns text on iOS | typography-token-on-textinput | [8669](https://github.com/joinfleek/fleek-monorepo/pull/8669), [8732](https://github.com/joinfleek/fleek-monorepo/pull/8732) |
| Satisfying exhaustive-deps by adding an unmemoized callback prop re-fires an effect on every parent re-render, resetting pagination — reverted 3 weeks later | react-hooks-exhaustive-deps | [8619](https://github.com/joinfleek/fleek-monorepo/pull/8619), [8751](https://github.com/joinfleek/fleek-monorepo/pull/8751) |
| Manual refetch calls after every cart mutation duplicate the round-trips Apollo's own cache update should have handled | redundant-network-refetch | [8621](https://github.com/joinfleek/fleek-monorepo/pull/8621), [8633](https://github.com/joinfleek/fleek-monorepo/pull/8633) |
| 3+ fix PRs re-edit the same filter/count hook for correctness bugs with no logic seam or unit tests ever extracted, despite the module-seam rule naming exactly this churn trigger | missing-test-seam | [8727](https://github.com/joinfleek/fleek-monorepo/pull/8727), [8745](https://github.com/joinfleek/fleek-monorepo/pull/8745), [8766](https://github.com/joinfleek/fleek-monorepo/pull/8766) |
| A fix PR extends a lib its own CLAUDE.md explicitly lists as deprecated, with zero mechanical enforcement catching it | deprecated-lib-drift | [8749](https://github.com/joinfleek/fleek-monorepo/pull/8749) |
| A single-screen PR edits a shared design-system component's style for one state only; other consumers break visually until an unrelated later PR patches the missed states | shared-component-blast-radius | [8519](https://github.com/joinfleek/fleek-monorepo/pull/8519), [8647](https://github.com/joinfleek/fleek-monorepo/pull/8647) |
| Loose substring matching on a free-text backend error message misclassifies unrelated errors and discards the real message — same exact bug in two independently-authored PRs | brittle-error-classification | [8775](https://github.com/joinfleek/fleek-monorepo/pull/8775), [8861](https://github.com/joinfleek/fleek-monorepo/pull/8861), [8755](https://github.com/joinfleek/fleek-monorepo/pull/8755) |
| A nullable value is directly dereferenced under strict TypeScript and compiles/ships anyway — evidence `tsc --noEmit` isn't a real CI gate for this app | type-safety-gate-gap | [8809](https://github.com/joinfleek/fleek-monorepo/pull/8809), [9236](https://github.com/joinfleek/fleek-monorepo/pull/9236) |
| An auto-generated token file is hand-edited directly by a single-screen feature PR; the generated-file guard doesn't cover this file pattern despite docs claiming it does | generated-file-hygiene | [9061](https://github.com/joinfleek/fleek-monorepo/pull/9061) |
| A migration deletes a screen file without finding all consumers; type-check passes (bundler resolution differs), red-screens production, rediscovered and fixed twice within hours | migration-safety | [9330](https://github.com/joinfleek/fleek-monorepo/pull/9330), [9348](https://github.com/joinfleek/fleek-monorepo/pull/9348), [9351](https://github.com/joinfleek/fleek-monorepo/pull/9351) |
| A native, activity-bound video player is constructed synchronously during render inside a carousel cell; crashes when Android backgrounds the app mid-rerender | android-native-lifecycle | [9006](https://github.com/joinfleek/fleek-monorepo/pull/9006), [9038](https://github.com/joinfleek/fleek-monorepo/pull/9038) |
| A process-global decoded-image cache never evicted on unmount; RAM stair-steps upward on a media-heavy screen across repeated visits | memory-leak | [9006](https://github.com/joinfleek/fleek-monorepo/pull/9006), [9070](https://github.com/joinfleek/fleek-monorepo/pull/9070) |
| A native-SDK video view keyed by unrelated UI state instead of the bound stream identity; a prop swap alone doesn't force the native module to re-bind | native-view-binding | [9040](https://github.com/joinfleek/fleek-monorepo/pull/9040), [9363](https://github.com/joinfleek/fleek-monorepo/pull/9363) |
| New analytics event names added as raw strings behind unsafe casts instead of the typed enum — same pattern in two unrelated PRs | type-safety-bypass | [8611](https://github.com/joinfleek/fleek-monorepo/pull/8611), [8606](https://github.com/joinfleek/fleek-monorepo/pull/8606) |

Lens B · 80 standalone fixes

## Pure bug-fix patterns

These fix PRs have no discoverable feature-PR origin in the sampled window — no shared ticket, author, or touched file linking back to a feature PR. Standalone defects, still clustered by recurring class.

PBF · No. 01

### Expected/benign states captured via `Sentry.captureException` instead of a breadcrumb, drowning real errors

**observability-noise** — 6 PRs fixing the same mistake · L1 · rule-doc

Six separate fix PRs downgrade a captured exception to a breadcrumb (or add fingerprinting) for conditions that are expected and non-fatal: a GraphQL "success: false" empty-data response (~123k events/14d), unhandled unread-count promise rejections (~22k events/14d), an unbounded retry loop capturing on every attempt (~9k events/14d), and LaunchDarkly identify() timeouts expected under slow networks (~31k events/14d, ~12k users). One of these fixed only one of three call sites sharing the identical literal error string; the other two kept firing until a dedicated hotfix caught the gap.

Recommended harness change`captureException` is reserved for unexpected/crash-worthy failures; expected backend states and degraded-but-recoverable SDK states use an info-level breadcrumb, escalating to a captured exception only once retries are exhausted. Before closing a PR that fixes one instance of a duplicated capture pattern, grep the repo for the same literal error string and fix or explicitly list the remaining sites.

[#8658](https://github.com/joinfleek/fleek-monorepo/pull/8658) [#8675](https://github.com/joinfleek/fleek-monorepo/pull/8675) [#8676](https://github.com/joinfleek/fleek-monorepo/pull/8676) [#8678](https://github.com/joinfleek/fleek-monorepo/pull/8678) [#8679](https://github.com/joinfleek/fleek-monorepo/pull/8679) [#8694](https://github.com/joinfleek/fleek-monorepo/pull/8694)

PBF · No. 02

### TypeScript escape hatches ship unblocked despite the explicit "No `any`" rule

**type-safety-escape-hatch** — 6 PRs · 4 distinct shapes · L3 · pre-commit check

`useSelector((state: any) => state.user)` shipped verbatim in two unrelated apps. `@ts-ignore` above a typing mismatch merged with an empty review array. A double-cast survived an "addressed comments" commit that touched unrelated files. A route param typed `any` masked a wrong-field access that made every generated chat-channel name read `"...: undefined"` in production. A styles factory referenced `theme` in its body with no `theme` parameter declared — should have been a compile error, and wasn't.

Recommended harness changeExtend the existing pre-commit lint style to a `no-any-escape-hatch` check blocking new `@ts-ignore`/`@ts-expect-error` without a linked ticket, unsafe double-casts, and selector/route-prop typed `any`, on changed lines. Separately, investigate why the type checker isn't catching the undeclared-parameter case — the same "not a real CI gate" gap flagged elsewhere in this audit.

[#8452](https://github.com/joinfleek/fleek-monorepo/pull/8452) [#8457](https://github.com/joinfleek/fleek-monorepo/pull/8457) [#8399](https://github.com/joinfleek/fleek-monorepo/pull/8399) [#8422](https://github.com/joinfleek/fleek-monorepo/pull/8422) [#9304](https://github.com/joinfleek/fleek-monorepo/pull/9304) [#9446](https://github.com/joinfleek/fleek-monorepo/pull/9446)

PBF · No. 03

### Gesture/touch-handling conflicts in nested React Native components

**gesture-handler-conflicts** — 5 PRs · 3 distinct mechanisms · R + L1

A gorhom bottom sheet mounted with imperative open/close refs leaks state across entity navigations when open callbacks are memoized with incomplete deps and no reset-on-entity-change effect exists. A draggable price-range slider inside a bottom sheet had its own pan gesture mid-drag terminated by the sheet's content panning gesture. And swapping a plain touchable for a gesture-handler button inside a widely-reused component fixed one conflict but broke taps wherever that component sits inside a _different_, already-present gesture-handler context elsewhere in the tree — reverted the next day.

Recommended harness changeFor gorhom-based sheets: any screen holding more than one entity-scoped overlay sheet needs a single effect keyed on the entity id that resets every overlay flag and closes every sheet ref; any draggable sheet content needs its panning gesture disabled and reviewed explicitly. Require any PR changing a widely-reused component's touch primitive to enumerate every screen/list rendering that component and confirm none nest it inside an unrelated gesture-handler context — a single-surface reproduction isn't sufficient proof for a component this widely reused.

[#8707](https://github.com/joinfleek/fleek-monorepo/pull/8707) [#8708](https://github.com/joinfleek/fleek-monorepo/pull/8708) [#9436](https://github.com/joinfleek/fleek-monorepo/pull/9436) [#8825](https://github.com/joinfleek/fleek-monorepo/pull/8825) [#8830](https://github.com/joinfleek/fleek-monorepo/pull/8830)

PBF · No. 04

### Async error paths silently swallowed

**error-handling** — 4 PRs · L3 · pre-commit check

A network-state check's `.then()` threw inside an outer _synchronous_ try/catch — the throw happens in a later microtask the try/catch already exited, so the helper never actually reported to Sentry (reviewer's comment: _"stop throwing this error to sentry, first check the volume"_). An update-check call had no `.catch()`, producing an unhandled rejection affecting ~350 users, while a sibling hook already wrapped the identical call correctly. An async lookup sat outside its surrounding try/catch, silently killing an action sheet on a crash. A mutation's failure response body was ignored entirely — no throw, no rejection, no user feedback.

Recommended harness changeEvery async call that can fail is awaited inside a try/catch or has an explicit `.catch()`; a throw must never sit inside a `.then()`/callback wrapped only by an outer synchronous try/catch; any mutation/response object carrying a success/ok field must be checked and surfaced on the failure branch.

**[#8990](https://github.com/joinfleek/fleek-monorepo/pull/8990)** — [#9000](https://github.com/joinfleek/fleek-monorepo/pull/9000) · [#9098](https://github.com/joinfleek/fleek-monorepo/pull/9098) · [#9103](https://github.com/joinfleek/fleek-monorepo/pull/9103)

PBF · No. 05

### Optional chaining guards only the first link of a multi-hop dereference chain

**null-safety** — 2 PRs, same exact shape, same module, weeks apart · L3 · pre-commit check

`params.file?.type.startsWith('video/')` guards only `.file`, not `.type`. Weeks later, in the same Chat module: a sender-lookup chain guards only the first hop, crashing on admin/system messages with no sender.

Recommended harness changeEnable a lint rule flagging a non-optional member access chained directly after an optional-chained expression when the intermediate value's type is nullable. `a?.b.c` is not equivalent to `a?.b?.c` — it only guards the first hop.

**[#9028](https://github.com/joinfleek/fleek-monorepo/pull/9028)** — [#9098](https://github.com/joinfleek/fleek-monorepo/pull/9098)

PBF · No. 06

### Cache staleness from misusing `fetchMore`, or two queries fetching overlapping data under different variable keys

**graphql-caching** — 2 PRs · L1 · rule-doc

`fetchMore` plus a replacement `updateQuery` was used for every search-term change, not just pagination, diverging the cache key from the watched query and leaving a supplier list permanently stuck after a no-results search. A progress bar read from one query while the add-to-cart flow only refreshed a differently-keyed sibling query, so the progress bar froze after adding items.

Recommended harness changeUse `refetch({ variables })` for filter/search-term changes on a watched query; reserve `fetchMore` + `updateQuery` strictly for pagination. Before adding a new query variant for an already-fetched entity, check whether an existing query already covers the same data under different variables.

**[#8670](https://github.com/joinfleek/fleek-monorepo/pull/8670)** — [#8963](https://github.com/joinfleek/fleek-monorepo/pull/8963)

PBF · No. 07

### Derived objects/handlers re-created every render defeat downstream memoization

**missing-memoization** — 2 PRs · L3 · pre-commit check

A helper call re-ran on every render, invalidating every downstream `useMemo` and causing a PDP backdrop flash. A search debounce handler was recreated every render, so the 500ms debounce window didn't actually persist across renders until wrapped in `useMemo`.

Recommended harness changeReinforce the existing useMemo guideline with a lint check flagging debounce/throttle-wrapped calls and object/array-returning helpers feeding a memo-gated child, when not themselves memoized.

**[#8656](https://github.com/joinfleek/fleek-monorepo/pull/8656)** — [#8670](https://github.com/joinfleek/fleek-monorepo/pull/8670)

PBF · No. 08

### Navigation/deep-link configuration completeness gaps

**navigation-config** — 2 PRs · L1 · rule-doc

A screen navigable from one tab wasn't registered inside that tab's own stack navigator (it was registered in every _other_ tab's stack), so navigation silently resolved it in the wrong stack and "back" walked that stack's history instead. A nested tab navigator's deep-link config had no default route, so profile deep links landed on the wrong screen inside that tab.

Recommended harness changeAny screen a stack's own screens navigate to must be locally registered in that same stack. Every nested navigator entry in a linking config's screens map must declare an explicit initial route.

**[#8891](https://github.com/joinfleek/fleek-monorepo/pull/8891)** — [#9365](https://github.com/joinfleek/fleek-monorepo/pull/9365)

### Eleven single-PR findings, kept for completeness

Not frequency patterns — one occurrence each — but each is a real, generalizable defect class worth having on record.

| Pattern | Category | PR |
|---|---|---|
| A Sentry helper spreads a raw params/upload object into `extra`, leaking on-device file paths, and constructs its own marker exception with no per-call fingerprint, collapsing 12 unrelated failure modes into one issue | observability-pii-leak / grouping | [9576](https://github.com/joinfleek/fleek-monorepo/pull/9576) |
| Session-scoped Sentry tags set on entering a transient state with no paired clear on every exit path — later events in the same session carry stale tags | observability-tag-leak | [9521](https://github.com/joinfleek/fleek-monorepo/pull/9521) |
| A debug `console.log` shipped to production, approved by 3 reviewers | stray-debug-console-log | [9387](https://github.com/joinfleek/fleek-monorepo/pull/9387) |
| release-please's per-package scoping means a libs-only fix doesn't bump a consuming app's version without a manual dummy diff under the app tree | release-process | [8662](https://github.com/joinfleek/fleek-monorepo/pull/8662) |
| A security fix pins a compromised package's direct version but omits a matching resolutions/overrides entry, leaving transitive resolution unaffected until a second commit | dependency-pinning-incomplete | [8544](https://github.com/joinfleek/fleek-monorepo/pull/8544) |
| A currency/unit relabeling function converts some fields on a record but not all, so a downstream consumer double-converts the unconverted one (~1.8× price inflation) | currency-unit-relabel-partial-conversion | [9686](https://github.com/joinfleek/fleek-monorepo/pull/9686) |
| A lookup's fallback is applied to the lookup key instead of the result, silently returning `undefined` | map-lookup-fallback-ordering | [9196](https://github.com/joinfleek/fleek-monorepo/pull/9196) |
| A function reads a Redux value back from a closure immediately after dispatch, before the store re-renders — the dispatched value isn't visible yet | react-redux-stale-closure | [9597](https://github.com/joinfleek/fleek-monorepo/pull/9597) |
| A LaunchDarkly targeting rule references a user attribute the app's identify() call never sends, matching nobody in production | feature-flag-targeting-context-gap | [9256](https://github.com/joinfleek/fleek-monorepo/pull/9256) |
| An async multi-item coordinator only proceeds when every item fully succeeds, so one stuck item (never failing, never completing) blocks the whole flow with no alert | async-coordinator-waits-for-success-not-settled | [9369](https://github.com/joinfleek/fleek-monorepo/pull/9369) |
| A minimum-price validation constant/formula/copy duplicated inline across two sibling upload flows; a third near-identical copy was about to ship before being caught and centralized | duplicated-business-constant-drift | [9370](https://github.com/joinfleek/fleek-monorepo/pull/9370) |
| A multi-party video feature decoded every remote participant at full resolution regardless of what was rendered, so memory scaled with participant count until the OS killed the app | unbounded-per-participant-resource-use | [9442](https://github.com/joinfleek/fleek-monorepo/pull/9442) |

Wave 2b · commit-level analysis

## Rework & review-effectiveness, in full

This is the analysis behind the headline number above: how much correction happens inside a single PR's own commit history, whether that changed once AI review arrived, and exactly what happens when it flags something serious.

### Mean rework roughly doubled — but the typical PR looks the same

| Metric | Pre-@claude (n=150) | Post-@claude (n=396) | Change |
|---|---|---|---|
| Mean correction commits / PR | 0.74 | 1.91 | +158% |
| Median correction commits / PR | 0 | 0 | unchanged |
| Mean review round trips / PR | 0.14 | 0.43 | +208% |
| Median review round trips / PR | 0 | 0 | unchanged |
| Mean days open | 1.52 | 2.02 | +33% |

The median staying at zero correction commits and zero round trips in _both_ eras means the typical PR didn't change — most PRs in both samples are still small, single- or few-commit changes that get one clean approval and merge. The mean increase is pulled entirely by a heavier right tail: the post-era sample contains noticeably more multi-day, 10–70-commit feature PRs and integration branches than the pre-era sample did. Days-open moved only modestly, which fits a shifted sample mix better than it fits "more review cycles."

**This report cannot attribute the mean increase to `@claude` review causing more rework.** Three confounds sit in the way: only 9.1% of post-era PRs actually got an `@claude` review, so it can't mechanically explain rework in the other 90.9%; the post-era sample skews toward visibly larger, longer-lived PRs where the correction-commit heuristic mechanically inflates regardless of cause; and CodeRabbit — a separate, largely unrelated bot — became active as an always-on reviewer across the same window and drives several of the round-trip examples itself. Net: the numbers moved, but the evidence doesn't support reading that movement as an effect of `@claude` specifically.

### The resolution-rate denominator

36 / 396 · PRs with any @claude comment (9.1%)

21 · of those, flagged Critical/Major

7 · fixed before merge

14 · merged unaddressed

Two of every three times `@claude` raised a Critical or Major issue on a PR in this sample, the PR merged without it being addressed. Reading the 7 "addressed" cases strictly narrows this further — at least one is a suppression (an unsafe cast wrapped in a lint-disable, not removed) and one other is a partial fix (one of two flagged files touched). Taken literally, the addressed count is closer to 5–6 of 21 (24–29%) than a clean 33%.

### Individual PRs with unusually high rework — pattern evidence, not developer evidence

Flagged by PR number only, as evidence of a shape, not of who wrote the code — this repo has a standing non-goal of no individual performance tracking, and nothing below identifies an author.

| PR | Signal | Read |
|---|---|---|
| [#9527](https://github.com/joinfleek/fleek-monorepo/pull/9527) | 24 commits, 23 corrections (96%) | Same-session self-polish loop (icon size changed 3×), not review-driven — a heuristic false-positive worth noting. |
| [#8357](https://github.com/joinfleek/fleek-monorepo/pull/8357) | 61 commits, 56 corrections | A merge-of-merges integration branch, not a single reviewed PR — the ratio is a shape artifact. |
| [#8640](https://github.com/joinfleek/fleek-monorepo/pull/8640) / [#8944](https://github.com/joinfleek/fleek-monorepo/pull/8944) | 58 / 73 commits | Explicitly flagged as atypical long-lived mega-branches where the heuristic is known to overcount. |
| [#9313](https://github.com/joinfleek/fleek-monorepo/pull/9313) | 28 commits, 9 round trips, ~18d open | Dense CodeRabbit/human review cycling on a large nav-typing feature — a genuine back-and-forth, not a heuristic artifact. |
| [#8557](https://github.com/joinfleek/fleek-monorepo/pull/8557) | Critical flag, unresolved | `@claude`'s own second review states plainly: "none of the issues raised in the previous review have been addressed." |
| [#8523](https://github.com/joinfleek/fleek-monorepo/pull/8523) | Critical flag, unresolved | A module-importing-from-screen architecture violation reconfirmed across 3 review passes, never touched again before merge. |
| [#8437](https://github.com/joinfleek/fleek-monorepo/pull/8437) | Critical flag, unresolved | A state-reset bug and a removed list behavior both restated "still not fixed" on a second review 8 days later, merged anyway. |

### What this changes about the headline finding

- **Confirms, with a real denominator, that the review-gate pattern is systematic, not anecdotal.** The 9 incidents sit inside a population where `@claude` flagged Critical/Major issues on 21 PRs and only 7 (33%, arguably 24–29%) were addressed before merge. Cite the one-in-three resolution rate, not "9 incidents."
- **Sharpens the scope: it's not that reviews are ignored, it's that the workflow is rarely invoked.** Only 9.1% of post-cutover PRs got any `@claude` pass at all. The risk is two-layered — an adoption gap (most PRs never get reviewed) and a follow-through gap (when they are, two in three flags go unaddressed) — and the adoption gap is at least as large a lever.
- **Qualifies "developers do more rework since AI review arrived."** Means moved 2–3×, but medians stayed at zero in both eras. The defensible reading: rework tracks PR size, the sample mix shifted, and CodeRabbit is a bigger presence in the round-trip counts than `@claude` is.
- **Next lever:** either a merge gate that blocks on an open Critical/Major `@claude` finding, or — arguably first — fixing the 9.1% invocation rate. A Critical finding that's never raised is indistinguishable, at merge time, from one that's raised and ignored.

Fine print

## Limitations, scope, and sources

What this audit deliberately does not do

- No per-developer counts, rankings, or "who causes the most follow-up fixes" appear anywhere in either source report or this page. Same-author matching was used only internally, as one signal among several for linking a feature PR to its fix PR — never surfaced as an output.
- 110 of the 637 human-authored Wave 2 PRs (mostly small chore/docs/refactor changes) were not deep-read; no finding above rests on them.
- The pre/post-@claude comparison compares a systematic 150-PR sample against a 396-PR set that was _selected_ (every PR Wave 2 already had reason to read), not an equivalent random sample — see the methodology note above before treating the percentage changes as precise.
- The correction-commit metric is a mechanical proxy (fixup-worded commits, or commits that re-touch a file an earlier commit in the same PR touched). It fires on ordinary incremental feature build-out just as readily as on a corrected mistake — several of the highest-rework PRs in the table above are flagged in the source data as heuristic false-positives, not genuine rework.
- Review round trips almost certainly undercount in both eras: GitHub's API doesn't expose a dismissed review's pre-dismissal state, and squash/rebase-before-merge erases true per-comment commit history on some PRs.

Run details

- Both passes ran as background multi-agent workflows against this repo's live GitHub history via the `gh` CLI — 39 agents for Wave 2 (933 PRs discovered, 527 deep-read, 0 errors), 39 agents for Wave 2b (150 pre-era + 396 post-era PRs extracted, 0 errors).
- Read-only throughout. No PR opened, nothing committed, no branch created by either pass.
- Full source reports: `hone-pr-mining-wave2-fleek-monorepo-2026-08-22.md` and `hone-pr-mining-wave2b-rework-fleek-monorepo-2026-08-22.md`, both in the repo root (untracked — `.gitignore` has no rule covering loose root-level markdown files).

fleek-monorepo · AI-1b Tech Velocity Initiative · Wave 2 + Wave 2b · compiled 2026-08-23  Read-only research. No PR opened, nothing committed, no individual attribution.
