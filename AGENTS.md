<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# GSPS Agent Instructions

## How this file works (2026-10-30, project owner)

Claude Code loads this file into every session, on every request. At 305 KB
(about 75K tokens) it was about 40% of each request's starting context in
every thread (measured on this project's threads on 2026-10-30). So it now
holds only the standing rules. Each rule names the file with its full text,
history and rationale, under `docs/agents/`, which no session loads on its own.

- **Read the matching `docs/agents/` file before working in its area**
  (`docs/agents/README.md` is the index). A rule's summary here never
  overrides its full text there. Where they seem to differ, the full text
  decides, and you fix the summary.
- **New dated history goes in the topic file, never here.** Add at most one
  line here when a new standing rule is made. `lib/__tests__/agents-md-size.test.ts`
  fails the suite once this file passes 48 KB.
- The file as it stood before the split is kept byte for byte at
  `docs/agents/archive/AGENTS-2026-10-29-d027cb1.md`; `docs/agents/MIGRATION_MAP.md`
  shows where every section went. Code comments that cite an AGENTS.md
  section by name ("Strategy Modes", "Audit outcomes", "Live weights
  incident" and so on) resolve to that heading in `docs/agents/`.

## Context efficiency — standing (2026-10-30, project owner)

1. Load only what the task needs. Search (`grep`, the index) before reading
   broadly, then read bounded sections. Read a whole source when correctness
   or a requested comprehensive review needs it.
2. Summaries and notes are navigation, not evidence. Exact wording, numbers
   and ids come from the source ("Verify before you report" below).
3. Don't reread unchanged material already in context. Reread when it may be
   stale, changed or incomplete.
4. Keep modes apart: an implementation task is not an unasked whole-platform
   audit, and an explicitly requested comprehensive audit is never shrunk to
   a diff. Keep a coverage ledger for it.
5. Delegate to subagents only focused work with a reason. Their tokens count
   too. Never spawn duplicates to hide context.
6. Bound tool output: keep long logs in a file, show excerpts, keep the real
   exit status, and never hide a failing check behind a filter.
7. Token ratios or estimated dollars are not savings. Measure accepted work
   and the allowance used.
## Product Roadmap

**`docs/SYNTHESIZED_ROADMAP.md` is the governing plan from 2026-10-21**
(owner: the roadmaps, parities, Gann files, Observation of Cycles, Hauck and
the creation equation "coagulate together" into one roadmap "that we shall
follow moving forward"). Read it first: its Part 5 is the current phase's
item-by-item status and its Part 7 says which thread owns what.
`ROADMAP.md` keeps each phase's detail and history. **Read it before
proposing new work, scoping a feature, or prioritizing between options** — it
decides what gets built and in what order, and it outranks `BACKLOG.md`, which
is an unscheduled idea pool rather than a set of commitments.

**Work out the current phase from today's date against this table** — don't
assume Q1:

| Phase | Window | Theme |
|---|---|---|
| Q1 | Aug–Oct 2026 | Monetization & retention foundation |
| Q2 | Nov 2026 – Jan 2027 | Differentiation & scale foundation |
| Q3 | Feb–Apr 2027 | Mobile & community |
| Q4 | May–Jul 2027 | Enterprise & scale |

Then open `ROADMAP.md` for that phase's goals, initiatives, and dependencies.
If today's date is past Jul 2027, the roadmap is expired — say so rather than
defaulting to the last phase.

- When suggesting work, name the phase it belongs to. If it fits no phase, say
  so plainly — it is either out of scope or a reason to amend the roadmap.
- Out-of-phase work is fine when there's a reason (production bug, security
  issue, blocked dependency, or a direct request). Note the deviation rather
  than presenting it as planned.
- When a change invalidates part of the roadmap, update `ROADMAP.md` in the
  same PR and move its "Last updated" date.

## Confidential sources — top-priority standing rule (2026-10-28, project owner)

In Chuck's words: "nothing and I mean absolutely nothing on the platform
disclose[s] his [Gann's] methods or formula, anything by LJ Jensen, anything
dealing with the observation of cycles or hermetic principles." Gann, Jensen,
Dewey/Thomas, the cycles literature and the hermetic principles (Hauck's book)
are the intellectual property the back end is built from, known only to
Claude and Chuck. GSPS presents itself as a stock trading and scanning
application.

- **User-facing means everything a person or a browser can read:** UI copy,
  labels, tooltips, the school, emails, notifications, API responses (strings
  and, over time, field names), user docs, marketing and page metadata, and
  any string in a `lib/` module a client component imports (it ships in the
  JS bundle; comments don't).
- **Internal code and project files may keep their citations**, in comments,
  server-only trace lines and docs that no user is shown.
- **The school teaches how to trade** with publicly available methods by
  others that build on or modify Gann's work (for example Elliott Wave),
  never Gann or these sources themselves. This supersedes, for education
  copy, the "Gann-grounded platform" rule's reach into education below; the
  back end stays Gann one for one.
  **Done 2026-10-28 (owner approved the outline):** Academy 2's, 4's and 6's
  method courses now teach Dow Theory, support and resistance, the 50%
  pullback, breakouts and pullbacks, Wyckoff ranges, trailing stops, Elliott
  Wave, Fibonacci, market stages, calendar lore and sizing, with Mr. Bull and
  Mrs. Bear kept and the lesson ids unchanged.
  `lib/school/__tests__/publicMethods.test.ts` fails a lesson that writes out
  one of the method's own rules. The graduation exam still grades GSPS's own
  plans, explained in plain words without the rules' timing.
- **Ids a browser or a member's row can read are neutral (2026-10-28, #510).**
  Exit rules are `structure` and `structure-runner` (the old `gann` and
  `gann-runner` are still accepted, so every "gann" exit rule in the history
  below is `structure` now), the strategy mode is `gsps`, the settings route is
  `/api/settings/trade-rules`, `pointScale.ts` exports `pricePoint`,
  `threePoints` and `pointForBars`, and scan results reach the client as
  `PublicScanResult`. Rows a member can read (`daily_scans`, `orders`,
  `trade_plans`, `trade_logs`) store `STORED_STRATEGY_VERSION`, a dated label,
  never the `STRATEGY_VERSION` name (`lib/backtest/publicVersion.ts`).
- `scripts/check-banned-terms.mjs`'s `CONFIDENTIAL_TERMS` gates the copy
  surfaces in CI, and `scripts/check-bundle-terms.mjs` gates the built bundle. Check the built bundle too (`grep -r` over `.next/static`)
  when a change touches what a client imports.

## Cross-platform consistency — standing principle

If a concept exists anywhere in this codebase — an indicator, an anchor
convention, a fixed constant, a computed field — and it applies to another
surface, it must exist there too. **Not existing everywhere it applies is
equal to not existing anywhere.** A concept built once and left stranded in
the module that introduced it is not "partially done" — treat it as not
done, and finish rolling it out before calling the work complete.

This is not hypothetical caution; it is the exact shape of two real defects
found in this codebase on 2026-09-10:

- **`harmonicProximity`'s stale Square-of-9 anchor.** The fix landed in the
  two callers feeding the scored criterion (`lib/scanTicker.ts`,
  `lib/backtest/replay.ts`), but `lib/marketScan.ts`'s coarse pre-filter and
  `lib/signals/confluence/gann.ts`'s confluence card kept the old, buggy
  anchor for another full day — quietly undermining every backtest run
  measured against the "fixed" criterion in between (see
  `lib/validation/criteria-registry.ts`'s `harmonicProximity` entry for the
  full history).
- **ADX/DMI**, built and validated for `lib/signals/regime.ts` (the Signal &
  Regime Engine) specifically to avoid leaning on PSAR/Supertrend as a sole
  signal, never reached the separate 9-point scanner score
  (`lib/scoring/score.ts`) at all — a second subsystem with the exact same
  "which indicator confirms a trend" problem, solved once and never
  propagated. (**Historical example, still valid as an illustration of this
  rule** — but as of 2026-09-16 ADX is no longer the scanner's answer to that
  problem: `adxTrendStrength` was discarded for failing the Gann-grounding
  gate. See "Audit outcomes" below. As of 2026-09-17 `lib/signals/regime.ts`
  no longer uses `adx()` either — see `lib/gann/trendStrength.ts` — and
  `adx()` was deleted on 2026-09-25.)

Before considering any indicator, anchor rule, fixed threshold, or computed
field "in place," check every surface it plausibly applies to — other
scoring paths, the live scan vs. the backtest replay, confluence/display
modules, coarse pre-filters — and either wire it in everywhere applicable or
say explicitly why a given surface is an intentional exception (e.g. a
module whose spec genuinely calls for different behavior, not just an
oversight). "When appropriate" is the only carve-out: a concept that
*shouldn't* apply somewhere (different timeframe, different asset class,
different governing spec) is a real exception, not a violation of this
rule — but the default assumption is that it applies, and silence is not
an exception.

## Gann & cycles research memory

Full text, including every dated rule change and `STRATEGY_VERSION` since
2026-09-27: `docs/agents/04-gann-research-memory.md`. Read the entries for a
rule or factor there before changing or diagnosing it.

- **Sources.** `docs/GANN_HISTORICAL_SOURCES.md` indexes every source
  reviewed; `docs/GANN_METHOD_COMPLETENESS_AUDIT.md` is the audit built from
  it. Read them before proposing, auditing or researching a Gann criterion.
- **Every book in the collection has been read (owner, 2026-10-16).** Never
  hold a rule as unverifiable on an unread book. The readings are in
  `/mnt/project-files/literature-reading-output/` (read-only; the long books'
  notes under `external/checkpoint_v7/`, where W023 is the *Master Stock
  Market Course*, W005 *Truth of the Stock Tape* and the *Stock Selector*,
  W001/W004 *Commodities*, W009 *45 Years*). A rule in Gann's own text is
  his rule and is carried; one in no book stays context only.
- **`docs/memory-bank/`**: start with
  `GANN_CYCLES_HERMETIC_MASTER_REPORT.md`; `GANN_PARITY_ROADMAP.md` is the
  rule-by-rule parity build plan (update its rows when a rule is built).
- **Gann's method supersedes the owner's own** (2026-09-27), and parity means
  a rule acts where Gann says it acts (trend, time, levels, entries, exits,
  education) on the live scan and the replay alike, not only on a card
  (2026-10-16).
- **`STRATEGY_VERSION`** lives in `lib/backtest/strategyVersion.ts`. Bump it
  when verdicts or replay trades move, and record the change in the topic
  file, not here.
- **Current standing values** (read the code before quoting them): cutoffs
  Execute 7 / Watch 4 (owner, 2026-10-21); `LIVE_EXIT_RULE` is "structure"
  (no fixed target, Q14); the production-faithful replay cell is
  `{"usePlanLevels":true,"entryRule":"reaction","exitRule":"structure"}`.
- **Porting a figure:** when Gann gives a number at a price, divide it by
  `pricePoint` at that price. Only his "3 points" and figures he states
  across price bands read as Gann points directly.
- **Data:** bars are split-adjusted, share counts are not; read historical
  counts through `splitAdjustedSharesAsOf`.
- **Server rules recorded there:** read the service key through
  `serviceRoleKey()` (`lib/supabase/service-key.ts`), never `process.env`;
  every write to the ledger tables goes through `ledgerWriter`
  (`lib/supabase/ledger.ts`); closed orders, positions and trade logs are
  never deleted by the app, and notices are pruned only within the windows in
  `lib/ops/retention.ts`; a new password form calls the breached-password
  check (`lib/auth/breached-password.ts`).
- **Measured state:** the edge is unproven across regimes (six-year runs);
  an inverted factor is presumed a translation defect first.

## WD Gann precedence — standing principle

Full text: `docs/agents/05-gann-precedence.md`.

- Where GSPS conflicts with what Gann taught (his books, courses and letters
  per `docs/GANN_HISTORICAL_SOURCES.md`'s tiers), **Gann's method wins**
  (owner, 2026-09-16).
- **Gann answers the question; don't hold it for the owner** (2026-10-21).
  Before holding any question, ask whether a Gann method answers it, and look
  in his books, `docs/GANN_HISTORICAL_SOURCES.md` and `docs/memory-bank/`. If
  one does, build it, cite the source in the code and the change record, and
  tell the owner what was decided. Only questions no Gann method answers go
  to him (security, access, billing, ops, legal, copy with no Gann content,
  or a figure Gann never gave, labelled an engineering choice).
- "This app is WD Gann re-manifested into a trading platform": the first
  design question is how Gann did it. That covers how the platform runs
  (what to scan, watch, refresh, and which names get scarce requests), not
  only trading rules.
- Translate the rule faithfully; don't port a raw historical number across
  asset class and era without saying so. Build a ready Gann-derived candidate
  live and document the change in place.
- No numerology or astrology without a citable Gann source.

## Gann-grounded platform — standing principle

Full text, with the audit outcomes (ADX, Sara/STRAT, the chart indicators,
entry pricing, the orphan-module audit, the 2026-09-25 platform audit and
F3.7): `docs/agents/06-gann-grounded-platform.md`.

Gann's methodology is the platform's substance on every surface: scanning,
scoring, levels, entries, stops, targets, risk, lifecycle, charting,
education and UI. A component with no Gann grounding is a defect to replace,
ground or explicitly justify, never a neutral default and never "fine because
it's only display".

**MANDATORY, EVERY SESSION: verify platform-wide, do not trust this list.**
Every prior list here proved incomplete. The sweep is cheap:

```
# Non-Gann techniques. Use word boundaries — unanchored "RSI" matches
# "reve<RSI>on" and will hand you a false count.
grep -rnE '\b(RSI|MACD|Bollinger|Wilder|adx|Supertrend|PSAR|Ichimoku|Elliott|Wyckoff|Keltner|Donchian|Fibonacci)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__

# Moving averages and VWAP. Hits under lib/strategies/, lib/indicators.ts,
# lib/analysis/indicators.ts and components/chart/ are the documented
# Strategy Modes / chart-overlay exceptions. Anything else needs a reason.
grep -rnE '\b(sma|smaSeries|ema|vwap|anchoredVwap|SMA|EMA|VWAP)\b' \
  --include=*.ts --include=*.tsx lib/ app/ components/ | grep -v __tests__ \
  | grep -vE '^(lib/strategies/|lib/indicators\.ts|lib/analysis/indicators\.ts|components/chart/)'
```

Confirm each hit is dead, documented, or gone. **A component is "not live"
only once traced to zero consumers**: an exported symbol, an API route, a
chart overlay and a database row are all live surfaces.

Decided exceptions, not to be removed on a future audit (reasons in the full
text): the Sara/STRAT bar-sequence taxonomy as display and confluence only,
never scored or gating; the user-driven chart indicators (SMA, EMA,
Bollinger, RSI, MACD and the like), which **must never feed a scored
criterion, gate, trade plan, entry, stop, target or GSPS verdict**; and
Strategy Modes (below). Entry pricing is Gann's swing crossing
(`lib/gann/entryTrigger.ts`), never a bar pattern; don't revert it to fix a
thin Execute bucket.

## Gann-derived AND measured — standing principle

Full text: `docs/agents/07-gann-derived-and-measured.md`.

Every scored criterion clears two gates: (1) **Gann-derived**, traced to a
citable source in `docs/GANN_HISTORICAL_SOURCES.md` with its tier; (2)
**measured**, with outcome evidence in `lib/validation/criteria-registry.ts`.
Measurement checks our translation, never Gann: a Gann-derived criterion
measuring negative is presumed a porting defect (wrong anchor, scale or
timeframe). **Check gate 1 first**: for a criterion that never was Gann's, an
inversion is the expected result, not a bug to hunt. Measurement does not
confer legitimacy on a threshold; a cutoff is a display decision. Changing
`CRITERION_KEYS` moves `TOTAL_POINTS` and both thresholds, so it is never a
drive-by edit (PR #236 is the precedent).

## The scorecard's role — recorded so it is not re-litigated

The scorecard supplies **no substance of its own**. It counts and ranks how
many of *Gann's* confirming conditions a setup satisfies, so the best
opportunities are identifiable — especially for a novice who cannot yet
weigh ten conditions by feel. It is a legibility layer over Gann's criteria,
not a competing method.

It earns its keep a second way: the factor table
(`lib/backtest/attribution.ts`) is the instrument that makes a mistranslated
criterion visible at all. Without it a wrong anchor stays invisible
indefinitely, which is exactly what happened to `harmonicProximity`.

Two consequences follow, and together they are why
`DEFAULT_CRITERION_WEIGHTS` is uniform as of 2026-09-16:

- **Weighting is substance.** A non-equal weight asserts that one of Gann's
  conditions outranks another. Nothing in the source catalog ranks the
  confirming conditions against each other — every "most important" in
  `docs/GANN_HISTORICAL_SOURCES.md` sits *within* a technique (50% among
  retracement levels, the Master Time Period among cycles, 1/2 = 26
  weeks among the 52-week fractions), never across them. (The Master Time
  Period's length depends on the lesson: 20 years in 1931, 60 in 1935, 56¾
  in 1953, 90 in 1955. Cite the lesson and year. See
  `docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md` Part I §1.6.) A weighted sum is
  therefore the scorecard injecting a ranking claim Gann never made. If a
  citable cross-criterion ranking is ever found, that changes this.
- **Thresholds are not substance.** A cutoff is where the ranked list gets
  split for display. It can be set or moved from measurement without
  claiming anything about the market.

## Hermetic principles & cycle theory — standing background lens

Full text: `docs/agents/09-hermetic-and-cycle-theory.md`.

The seven Hermetic principles and the cycle literature (Dewey, Tomes) are an
active design input to Gann-adjacent work. Before building, answer in writing
(a module header; `lib/gann/entryTrigger.ts` is the example): (1) which Gann
source discloses it, at which tier; (2) what the cycle literature says, with
Dewey's seven-item checklist run for any periodicity claim (and, when
validating a cycle, persistence through changed conditions, out-of-sample
persistence and a significance test); (3) which Hermetic principle it
expresses. **They shape design and are never evidence:** only a citable Gann
source or a measured result moves a threshold, weight or gate. A belief with
no source that hasn't cleared Dewey stays labelled, confluence-only, never
gating. They don't explain past constants (the count of 9 was never
numerological).

## Astrology — standing decision

Full text: `docs/agents/10-astrology.md` and
`docs/agents/11-every-gann-method-acts.md`.

Superseded in part on 2026-10-01: astrology from Gann and from Jensen now
acts. Still standing: only a technique in Gann's own text, letters or charts
(or Jensen's, by the owner's inclusion) is built; Dewey's discipline holds
(the rule fixed before testing, with no search over planets, orbs or price
scales; hit rate against base rate, significance with correction,
out-of-sample); the planetary averages act as price resistance and no School
lesson teaches them.

## Every Gann method acts; Jensen's astrology is included — owner decisions, 2026-10-01

Full text: `docs/agents/11-every-gann-method-acts.md`.

"Every Gann method acts ... no more watching, or background, or serving as
confluence." Each Gann method acts where Gann says it acts (a level as a
level, a time count as a time window, an entry or exit rule as one), on the
live scan and the replay; Jensen's astrology is included. It doesn't cover
non-Gann material (Strategy Modes, chart indicators, Sara/STRAT stay as
recorded). Limits: undisclosed methods (Master Time Factor, the lost plates
and the like) can't be built; how methods combine is GSPS's labelled choice;
a time count marks a window, never a setup on its own; every acting method is
measured in the replay; a future date shown to a user needs its source,
method and measured record ("Forward-looking claims"); no performance claims.

## Strategy Modes — scoped exception to the non-Gann boundary

Full text, with the custom-script phases and verification passes:
`docs/agents/12-strategy-modes.md` (and `docs/STRATEGY_MODES.md`).

A separate, opt-in system (`lib/strategies/*`) that reads named non-Gann
techniques. Rules: Gann's plan stays the default and the only substance of
GSPS's verdict; a mode **never reaches the scan, score, gates, GSPS's plan or
any automated order**; one mode at a time, chosen by a person, labelled at
every display. Since 2026-10-22: techniques that align with Gann's plan are
listed first and trade its levels; any other technique offers its own entry,
stop and TP1, **never an MTP**; GSPS guides and never forces. Tier gating is
server-side only (`lib/entitlements/policy.ts#allowedStrategyModes`): Novice
none, Pro four modes, Expert and Wall Street all ten (Elliott Wave since
2026-10-28). Custom scripts: Wall Street only, private to the author, parsed
by the whitelist DSL with no `eval`. **Merging a migration is not applying
it.**

## Forward-looking claims — standing direction (2026-09-28, project owner)

Forward-looking claims (a dated window, a projected turn) are allowed **when
verified by documentation**: the Gann source, the method that produced it, and
its measured record (a backtest or a forward test such as the F4 calendar
test) are written down and linked where the claim is shown. An undocumented
projection stays out. The owner cites a forward test from a former session
that projected a 2027–2029 window from Gann's own model; the module behind it,
`lib/gann/macroCycle.ts`, is on the unmerged branch `claude/stoic-brown-p296wd`.
This does not relax the rule against performance claims or guarantees.

## Three-question mandate — the lens work is reasoned through, every session

Full text, with the motivating precedent and worked examples:
`docs/agents/14-three-question-mandate.md`.

While conceiving any feature, function or update (not after its shape is
fixed), answer in writing where the work lands: (1) how Gann's methodology
best grounds or improves it, with source and tier; (2) how Dewey's and
Tomes's cycle work informs it, with Dewey's checklist for any periodicity
claim, stating what cleared and what didn't; (3) which Hermetic principle
fits, chosen from all seven by fit, not habit, and whether it changes the
design. It applies platform-wide, UI, copy, onboarding, tiers and billing
included; where (1) doesn't apply, (2) and (3) still do. Only work with no
product-facing shape is exempt, and say so plainly. It is a design
discipline, never evidence or a gate.

## The Law of Creation — fourth question of the mandate (2026-10-21, project owner)

"Add this to the same memory bank that our mandate, roadmaps, parities and
memory [live in] so every session implements it by default." The owner's
Multi-Dimensional Creation Equation is in
`docs/memory-bank/LAW_OF_CREATION.md`, kept as he gave it: two complementary
entities that truly interact produce a third neither contained
(a ⊗ b = a + b + I(a,b)·ab, so 1 ⊗ 1 = 3), while a pair that does not interact
is a mixture (1 + 1 = 2); the created third can interact again; substance is
conserved, form is created. **Every session applies it by default** as a fourth
question beside the three-question mandate above, while conceiving a concept:
name the complementary pair, say whether the join is a creation or only a
mixture, and where a created third exists, what it is and where it re-enters.
Same discipline as the Hermetic lens: it shapes design and reasoning and is
never evidence. It cannot move a threshold, weight, gate or verdict, and its
counting results (2ⁿ − 1, the chain, 3ⁿ) are interpretive by the owner's own
tier, never market numbers. Worked readings (price ⊗ time, level ⊗ close,
novice ⊗ expert, live scan ⊗ replay) are in that file.

## Cycles as architecture, not only scoring — standing direction (2026-09-23, project owner)

Full text: `docs/agents/16-cycles-as-architecture.md`.

Before designing a recurring process (a cron cadence, rescan, rotation,
retry), ask whether it should be a returning cycle rather than "run once and
stop", and say which in the module header. Anchor a cycle's phase to the
clock, not a stored counter, so a missed tick resumes correctly
(`lib/scan/universe-rotation.ts` is the example). The shape is
Rhythm-grounded; the numbers are engineering choices, never Gann-derived.

## Three-path tier promotion (2026-09-25, project owner direction)

Full text: `docs/agents/17-tier-promotion.md`.

Every tier step clears through Curriculum, Track Record or Pay Your Way
(`lib/promotion/*`). The Academy 8 capstone is required for Wall Street on
every path; don't make that path-independent without the owner. Graduation
exams belong to the curriculum path only. The track-record profitability
metric never feeds risk sizing or execution scoring. Promotion billing stays
off (`isPromotionBillingEnabled()`) until real Stripe prices exist. Promotion
copy expresses graduation through constraints lifted, never performance
claims (`lib/promotion/copy.ts`).

## Setup cards, MTP and the intraday refresh budget (2026-09-30, project owner)

Full text, with every intraday, notification and email change since:
`docs/agents/18-setup-cards-and-intraday.md`. Read it before touching any
list of setups, the intraday scanner, its queue, alerts or notices.

- **One card everywhere:** `components/setups/setup-card.tsx` opens every
  setup by its name; a new list uses it. It shows the per-pillar rollup only;
  **never pass a row's `breakdown` to the client**.
- The master take profit is **MTP** wherever a person reads it.
- Intraday TP1 and MTP are Gann levels or nothing; every intraday TP1 pays
  more than the risk. The intraday scanner times the daily plan; alerts held
  by `tradeHold` (`lib/scanner/intradayDisplay.ts`) are shown for study only.
- The refresh budget lives in `lib/entitlements/policy.ts` and is enforced
  in `lib/entitlements/intraday-refresh.ts`.
- **Email only for what needs the member:** a new email sender calls
  `emailBudgetHold` with its kind; intraday signals and notices go by push and
  the bell only.
- The evening report goes to the owner's addresses only; widen recipients
  only on his word.

## Polarity audit: a genuine second pole for Novice/Pro, not a subtracted one

Full text: `docs/agents/19-polarity-audit.md`.

A shorter feature list is not a second pole. When a feature is gated away
from a lower tier, design that tier's own counterpart in the same change
(Trade Reviews and Guided Mode are the examples). New curriculum teaches a
technique's premise, never another practitioner's words or methods verbatim.

## Temporary overrides — mandatory, check on every session

Full text, with the execution-timeframe and stopgap history and the live
weights incident: `docs/agents/20-temporary-overrides.md`. When a revert
trigger fires, raise it with the user before touching the affected code.

- **Equity data delay and notification freshness (2026-10-28, until real-time
  data is bought).** `lib/data/timeliness.ts` is the one time contract
  (`docs/DATA_DELAY_AND_FRESHNESS.md`): a decision reads only bars usable at
  its clock, orders fill at the first bar after it, replays keep the delay.
  **A new notification path must call `checkAlertFreshness`**; only
  actionable wording may say "now". Revert trigger: a verified real-time
  feed, needing both `MARKET_DATA_REALTIME=true` and
  `MARKET_DATA_REALTIME_VERIFIED_AT`. Never set either without the owner.
- **Execution timeframe is 15Min.** Don't re-widen `EXECUTION_TIMEFRAME`
  for a thin Execute bucket; that was tried and reverted.
- **Check the configuration surface, not just the code.** Before reporting
  any constant, threshold, weight or flag as live, check what overrides it
  outside the repo: `learning_models` live rows (adopted only if uniform and
  keyed to `CRITERION_KEYS`), `policy_values` (may only tighten a limit), and
  environment variables (`GSPS_DISABLE_*_CONFLUENCE`, `MARKET_DATA_REALTIME`).

## Speed is a product requirement, not a platform ceiling — standing direction (2026-09-25, project owner)

Recorded here because it has had to be restated four times. The 60-second
budget that runs through this codebase (`maxDuration = 60` in
`app/api/market-scan/route.ts`, `FULL_UNIVERSE_TOP`,
`CONTINUATION_DEADLINE_MS`, `YEAR_CYCLE_RERANK_DEADLINE_MS`) is **a
self-imposed limit**, set so a novice feels safe using the product. If the
flagship scan feels slow, prospective users draw negative conclusions about
the whole platform, and that is the outcome to avoid.

What that means for a session:

- **Do not describe the budget as "Vercel's limit"** or treat it as a
  constraint to engineer around. It is a design decision about how the
  product should feel.
- **Do not solve latency by raising the budget.** Raising `maxDuration` or a
  deadline to make room for new work spends exactly what the budget exists to
  protect. New work fits inside it, or it runs off the user's path.
- **Every change that adds time to a scan says how much**, measured, not
  estimated (the `[market-scan]` `mark()` breadcrumbs exist for this), and
  says whether a user waits on it.

## Deployment (Vercel)

- The project runs on the **Vercel Hobby (free) plan**. Cron jobs are capped at **2 per project**, each running **no more than once a day**. Before adding a new scheduled job, confirm the total stays at or under that cap — see `docs/THIRD_PARTY_LIMITS.md`. If something needs to run more often than daily, it does not belong in `vercel.json` crons; trigger it from an external scheduler instead.
- `vercel.json` sets `"git": {"deploymentEnabled": {"main": true, "*": false, "*/**": false}}`: **only `main` builds**, and **merging to `main` deploys straight to production**. Pushing any other branch builds nothing and gets no preview URL (owner, 2026-10-16: previews were using up the Hobby plan's daily deployment limit, which failed every PR's Vercel check). The patterns are minimatch globs, and `*` never matches a `/`, so until 2026-10-21 every `claude/...` branch still built a preview and the account hit 100 deployments that day; `*/**` covers them. There is no manual gate in between. Treat a merge as a release: it is live for users within a couple of minutes.
- **Never trigger a Vercel deployment unless explicitly asked.** The user will say which environment — preview or production — when they want one. Don't assume. Because merges auto-deploy, this also means **don't merge to `main` unless asked** — merging is deploying.
- A branch push builds nothing on Vercel, so verify a change with the repo's own checks before merging. A preview is a manual deployment, made only when asked.

## Verify before you report — standing rule (2026-10-22, project owner)

Chuck's correction, after the same failure three times: the book reading
reported works as read or unread that weren't; a session reported 47 lines of
Gann code unusable when 6 were; and a "waiting on you" list named a Resend step
he had already done. Each time a count or a status was reported from memory or
an earlier note instead of from the source as it stands. Project memory is off,
so this file is the only place the rule carries between sessions.

- **Every count, status or "done / not done" you tell the owner is read fresh
  from its primary source in the same turn:** the file, the grep, the test
  run, the database row, the PR's checks, the other thread's latest message.
  A note, a summary, a checklist or your own earlier reply is a lead, never
  the evidence.
- **Say what you checked and when** ("grep at 01:30 UTC found 6"), so the
  owner can tell a measured figure from a remembered one. If you could not
  check, say that, and don't give the number.
- **A count is recounted, not carried.** When a figure came from a subagent,
  an earlier session or a document, re-derive it before repeating it, and
  report any difference from the earlier figure plainly.
- **What is waiting on the owner** lives in
  `/mnt/project-files/owner/waiting-on-chuck.md`. Add an item the moment it
  starts waiting on him and strike it the moment it is done. Before telling
  him what needs him, re-read that file and each item's own thread.
- **Reading coverage** ("read", "inspected", "complete") is claimed only from
  the work's own coverage record, page by page, never from a summary.

## Code review before every merge — standing mandate (2026-10-21, project owner)

In the owner's words: "1. code reviewer checks all code to make sure it is
working correctly, and implement just as Gann would. 2. any code that comes
back with an error is highlighted and solved for, as Gann would 3. only after
all code passes the reviewer can the pr be merged." Every session, every PR,
no exceptions by size.

- **Scope: the PR's own diff.** The whole repository was reviewed on
  2026-10-21 (`/mnt/project-files/senior-code-review/`), so a review covers
  only the code in the PR about to be pushed or merged, plus whatever that
  code calls or is called by where the change could break it.
- **Premise: the 2026-10-21 senior review's** (§1 of
  `senior-code-review/00-comprehension-and-manifest.md`). Two questions for
  every changed file:
  1. Does it work as intended? Logic, edge cases (NaN, null, Infinity,
     sub-penny and negative prices), rounding, New York time and DST,
     closed bars only, no look-ahead, determinism, error handling, and
     whether the tests prove the behaviour.
  2. Does it carry Gann's method? Each rule traced from its source (book
     and page) to the code and the test, marked FAITHFUL, APPROXIMATED,
     ABSENT or CONTRADICTED; the live scan and the replay run the same code;
     the rule reaches every surface it applies to (cross-platform rule
     above). Gann doctrine, the STRAT display taxonomy and the Hermetic
     gates stay separate in every finding.
- **Errors are highlighted and fixed, as Gann would.** Each finding is listed
  with file, line and a concrete failure. The fix follows "Gann answers the
  question" above: his rule is the answer, cited in the code and the change
  record. Only a question no Gann method answers goes to the owner.
- **Merge only after the review passes.** Fixes go on the same PR and are
  reviewed again until no blocking finding remains. Record the result in the
  PR body (a "Code review" section: what was checked, findings, fixes). The
  owner's "merge when green" means green CI and a passed review.
- A reviewer may be a separate agent or a fresh pass by the session itself,
  but it reads the diff cold, as a reviewer, not as the author defending it.
- PRs merged before this mandate (#405 and earlier on 2026-10-21) are
  reviewed after the fact when their thread is next active, and any fix
  ships in a new PR that passes review.

## GitHub Actions minutes: how every session works on the free tier (2026-10-28, owner)

The repository is private, and a private repository on GitHub's free plan
gets 2,000 Actions minutes a month. Once they run out, every check stops
until the month resets (the spending limit is $0, so nothing is billed). The
month before the switch used 13,321 minutes, about 33,000 a month at the
last week's pace (measured 2026-10-28 from the Actions run list). Chuck's
words: "Make the necessary changes so that this and future session adhere to
our new way of working (until we upgrade from the free tier)". These rules
hold until he says the plan has been upgraded.

- **One PR per piece of work, pushed once.** Finish the work, run the suite,
  `tsc --noEmit`, eslint and `scripts/check-banned-terms.mjs` locally, then
  open the PR. Don't open it early and push after every fix: every push to an
  open PR runs the full suite (3 to 5 minutes). Fix review findings in one
  push, not one push each. A PR that is still in progress is opened as a
  draft; drafts run no tests until marked ready.
- **No catch-up merges.** A branch pulls main's latest changes into itself
  only when GitHub reports a conflict, or the branch-age gate fails, never
  just to stay current. The release PR below tests every branch together
  with main anyway.
- **Four releases a day (owner, 2026-10-28: "every 6 hrs").** Finished,
  reviewed, green PRs wait in the merge queue (the Senior code review thread,
  `/mnt/project-files/merge-queue.md`). Around 6:00, 12:00, 18:00 and 00:00
  New York time, skipping a train with nothing ready, it builds one release branch from
  main, merges each waiting PR's branch into it (resolving any conflict
  between them there), opens one release PR, and merges it once it is green.
  Each included PR then shows as merged. Tests run once for the batch and
  production deploys once, which also keeps Vercel under its deploy limit.
  A production bug or a security fix may skip the wait and merge on its own;
  say why in the PR. When Actions minutes run near the 99% hold, trains fold
  into the next window with minutes to spare, and a release goes as one push
  and one CI run.
- **What CI skips** (`.github/workflows/test.yml`): branch pushes with no PR
  (since 2026-10-28), draft PRs, and PRs that change only Markdown other than
  README.md and FEATURES.md. Never widen a skip to `docs/**`:
  `criteria-gate.test.ts` reads `docs/replay-runs/*.json`.
- **Replays and manual workflows** (`backtest-universe.yml` and the like) run
  only on the owner's ask, and a session says the estimated minutes first.
- **Before adding a workflow, a job or a trigger**, say what it costs in
  minutes a month. A new check is a step in an existing job where it can be
  (each job is billed at least a minute, however short).

## Usage limits: alerts and the 99% hold (2026-10-28, owner)

Chuck: "track how close we are to reaching our limit(s). Update us at 25, 50,
60, 65, 70, and in intervals of 5 until 90% of usage. Go by 2 until 96%. Then
go by 1 until 99. But never allow us to use all 100% of our limits unless it is
within the last two days of the allotted month."

- **The meter** is `lib/ops/usageLimits.ts` (rules), `lib/ops/usageStore.ts`
  and `/api/ops/usage` (migration 0133). Meters: GitHub Actions minutes (2,000
  a UTC month), Vercel deployments (100 in a rolling 24 hours), email (Resend
  free: 100 a UTC day, 3,000 a month, from `email_daily_budget`), and, alert
  only, the Supabase database (500 MB), its connections (60), file storage
  (1 GB) and monthly active users (50,000), and Alpaca's 200 requests a
  minute (the month's busiest minute, from its rate headers). The full table,
  and what can't be read from here, is in `docs/THIRD_PARTY_LIMITS.md`. Each threshold emails the owner once
  a period, with times in ET.
- **How it is fed.** Every workflow job starts with a "Usage gate" step and
  ends with a "Usage report" step (`if: always()`) that posts its billed
  minutes, rounded up. A push to `main` also reports one Vercel deployment.
  **A new workflow job must carry both steps** (copy them from `test.yml`),
  or its minutes go unmetered. A manual Vercel redeploy is not seen; post it
  (`{"meter":"vercel_deployments","units":1,"key":"deploy-<id>"}`).
- **The hold.** At 99% the gate fails the job, and the merge queue merges
  nothing while `usage_readings` shows `hold = true` for `github_actions` or
  `vercel_deployments` (`select * from usage_readings` through the Supabase
  tools; it is rewritten on every report and hourly). The hold lifts in a
  monthly limit's last two days (UTC), when the period resets, or for an
  urgent production fix Chuck OKs: add the `usage-override` label to its PR,
  then close and reopen it (a label alone starts no run), and for a merge insert a `usage_overrides` row (`meter`, `until`, `reason`
  citing his message). Never add either without his OK in words.
- **Reconcile** when a session measures the real figure (the GitHub billing
  page, or the run list): post the difference as one event with a `key` of
  `reconcile-<date>`. Each job reports its step time plus 30 seconds for
  setup and post-job steps, so the meter runs close to GitHub's billed figure;
  a gate that can't read the meter warns and lets the job run. The meter started at 1,121 minutes measured from the run
  list at 22:20 UTC on 2026-10-28 (private since 04:47 UTC).

## Git / PR Workflow

- After pushing commits that contain code changes, **always open a pull request** against `main` rather than stopping at the push. Check for a PR template first.
- Do work on the designated feature branch for the task; don't commit directly to `main`.
- **No PR merges before its code review passes** (see "Code review before every merge" above).
- **Name the ROADMAP phase in the PR** — `Q1`, `Q2`, `Q3`, `Q4`, or `N/A` for out-of-phase work — in the title or body. The `roadmap-phase` CI gate requires it.
- **Delete the branch immediately after its PR merges** (`git push origin --delete <branch>`, or GitHub's button on the merged PR). Not later, not at the next cleanup.
- A PR whose branch diverged from `main` more than 30 days ago fails the `stale-branch` gate. Merge `main` in (or rebase onto it) and push.
- `bash scripts/audit-stale-branches.sh` reports merged, stale, and active remote branches; a scheduled job runs it monthly. See `CONTRIBUTING.md` → "Branch hygiene".
