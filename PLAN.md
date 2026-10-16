# PLAN: bringing GSPS in line with the Gann rules in `gann_features.json`

Written 2026-10-15. You decide what is built; this proposes an order and how each item would be done.

## Decisions (Chuck, 2026-10-15 17:14 UTC)
1. **Approved to build: items 1 and 2.** Nothing else yet.
2. **Pass rule: yes.** Apply Gann's rules one for one, everywhere they apply in GSPS. Scaling a number to price passes when the code documents it.
3. **Item 3, when approved: use Gann's full 3 points now** (price-scaled by `pointScale.ts`) on the entry side too; revisit if the Master Course reading changes it.

Roadmap phase: today is in **Q1** (Aug–Oct 2026, monetization and retention). None of this is a Q1 initiative. It continues the out-of-phase Gann-grounding work, so each PR will say `N/A` (out of phase, direct request).

## What the feature list holds

`gann_features.json` has **342 entries**, all `"passes": false`. Details of where each came from are in `NOTES.md`.

| Class | Entries | Meaning |
|---|---|---|
| A | 117 | Gann's own text, read (mostly W006, W022, W036, W046, W001) |
| B | 1 | Press report (W010) |
| C | 72 | Secondary or vendor work attributing the rule to Gann |
| CYCLE | 52 | Dewey, Halberg and Tomes validation rules |
| UNVERIFIABLE | 77 | Rests on a book not yet read (the nine you're reading) or not in the collection |
| UNDISCLOSED | 23 | Gann names it but never explains it (Master Time Factor, CE Average, MOF Formula…) |

- 240 entries name a GSPS location; 102 have none. 163 of the located ones **differ** from the rule as written, and the `gsps_location` says how.
- 109 entries cite an existing test; the rest say `TO WRITE: <file> — <assertion>`.

## The rule for flipping `passes` (needs your yes)

An entry passes only when **all** of these hold:
1. A test asserts the rule **as Gann wrote it**, with GSPS's scaling of a number allowed only where the code header documents it (e.g. Gann's "3 points" price-scaled by `pointScale.ts`). A structural difference (a different construction, a context-only field where Gann acts on it) does not pass.
2. The test was run and the output is shown.
3. A fresh-context reviewer checked the diff against this plan and the entry.

`UNVERIFIABLE` entries stay `false` until your reading lands. `UNDISCLOSED` entries stay `false` permanently; building them would mean inventing them.

## Proposed items, in the order I recommend

Each item: failing test first, minimal fix, run the check, show the output, commit, append to `claude-progress.txt`, one git worktree per fix, fresh reviewer before any `passes` flips. Items marked **moves the verdict** change scores, plans, orders or risk, so they also need a replay run on a bumped `STRATEGY_VERSION` before they go live, per AGENTS.md.

### 1. Verification sweep (no product change)
Run every one of the 109 cited tests, check each really asserts its entry's rule, and flip `passes` only where the rule above holds. Output: a table in `claude-progress.txt` of what passed and why the rest didn't.
*Why first:* it tells us the real starting count before anything is built.

### 2. Tests for rules GSPS already implements but never tests
No behaviour change, only tests. If a test fails, that's a real bug and becomes its own item.
- `lib/analysis/trend.ts` `readTrend`: no test, yet every macro trend read goes through it (A-TREND-01, A-TREND-02).
- Monthly-low/high break in the campaign ledger; volume at highs (the volume tests cover lows only); the shares-per-point top warning (its only test checks it doesn't throw); merging nearby levels; the bearish counter-move clock; "topped before the market".
- A stop never exceeding Gann's 5-point cap, price-scaled (A-STOP-02). This one will fail today; see item 4.

### 3. Gann's "3 points" on the entry side — **moves the verdict**
W006 pp.20–24, 46–47 puts both the crossing and the stop 3 points beyond the level (A-ENTRY-01, -02, -04, -14, -15, A-STOP-01, A-STOP-03). The exits and stop-breach already use the price-scaled 3 points (`pointScale.ts`). Everything else still uses a fixed 0.3%, which `pointScale.ts`'s own header calls about a tenth of Gann's figure:
`lib/lifecycle/entryConfirmation.ts:80`, `lib/gann/entryTrigger.ts:97`, `timeRules.ts:52`, `multipleTops.ts:68`, `accumulation.ts:52`, `pyramid.ts:109`.
*How:* swap the constant for `gannThreePointsPct(price)` in each, one surface per commit, live scan and replay together, then a replay run.
*Your call:* the roadmap says the entry crossing's "lost motion" is about 1⅞ points, citing the unread Master Course. Until that is read, should the entry crossing take W006's 3 points, or stay at a smaller allowance with only the stops, halt stop and top-crossing moving to 3?

### 4. Stop width cap — **moves risk**
W006 p.46: never risk more than 5 points. `lib/strat/levels.ts:153-154,191` allows stops 3–15% from entry (20% on large caps), and places them 0.5% beyond support rather than 3 points. Five price-scaled points is about 11.8% at $42.50 and 6.25% at $200.
*How:* cap the stop distance at 5 price-scaled points; a setup whose structural stop is wider is held to Watch rather than widened. Replay run before live.

### 5. Cycle validation tests (CYCLE entries)
- A null test: `detectSpectralCycle` must stay inactive on white noise and on a random walk (CYC-28, Yule–Slutsky).
- Decide the hold-out only on the first 70% of the data, so the unseen 30% can't decide whether it is tested (CYC-08).
- Base rates for `timeCycles`, `yearCycleConvergence`, `macroCycle` and `decadeCycle` (CYC-24, CYC-47, CYC-52): how often is a window "active" on a random day.
These are research and measurement code; they don't change a verdict unless a later item acts on the result.

### 6. Gann rules from W006 with no code at all — context first
Entered as card and replay context fields (measured, not gating), the same way Stage A was:
- crossing the previous year's top or bottom by 3 points (A-ENTRY-05, A-ENTRY-17);
- new all-time highs (A-ENTRY-06); the older the top, the more it counts (A-ENTRY-09);
- an all-time low held for weeks without a 3-point break (A-ENTRY-10);
- a narrow week followed by a sharp drop on heavy volume (A-ENTRY-19);
- the largest weekly volume since a prior top (A-VOLUME-12);
- bear-market duration bands, 12–43 months (A-TIME-06).

### 7. Decisions where Gann's own texts or GSPS's choices disagree (you choose; I build)
- **Pyramid lots** (A-PYRAMID-01, -02). W006 Rule 5: equal lots every 5 points ($20–50) or 10 points ($80–200), halve after the 4th–5th. W022: largest lot first. GSPS halves every add and stops at 4 lots. Which one?
- **Size increases** (A-RISK-04, M-K3). W006 p.46: double the unit only once profits equal the original capital. `lib/risk/dynamic-risk.ts` `resolveRiskBand` steps the risk rate up after 20 and 40–50 trades. Align it with W006?
- **"Never too high to buy"** (A-TREND-09, W006 pp.22, 38–39). `lib/marketScan.ts:416-429`'s coarse reversion pass scores extension and fades it. Remove that scoring, or keep reversion as a separate, labelled pass?
- **After a loss series** (A-RISK-07, W022). GSPS pauses entries after 3 losses; W022 cuts the unit to 10% of what remains. Add the unit cut alongside the pause?

### 8. Intraday consistency
`lib/scanner/intraday.ts` uses none of the swing chart, price-scaled points or stop-breach code that `replayIntraday.ts` uses. Point the live alerts at the same primitives (AGENTS.md cross-platform rule). Moves the intraday alerts.

### 9. Housekeeping (docs only)
- Correct the coffee letter note (`docs/memory-bank/sources/A2_3_coffee_letter_1954.md`) in the five places it differs from the scan, and flag Gann's own three slips. **Held for you** (the reading thread's open question 3).
- Fix stale roadmap cells and AGENTS.md's line that `macroCycle.ts` is on an unmerged branch.
- Step 9 of your method: `CLAUDE.md` is one line (`@AGENTS.md`), but AGENTS.md is very long. Move the domain history into `docs/` and keep AGENTS.md to commands, key files, source classes, protected actions and status vocabulary. This is a large doc change, so only if you want it.

## Full parity order (Chuck, 2026-10-15 17:58 UTC)
Chuck: "GSPS should be a 1 for 1 implementation of Gann's methodology." That covers three things: rules with no code get built; rules with code that nothing uses get wired in; and context-only (confluence) rules act where Gann says they act. The working method stays the same: one item at a time, failing test first, a fresh reviewer, UNVERIFIABLE for unread books, and entries and tests are never edited to make them pass. Items run in this order without waiting between them. I stop only where a rule forks on something only Chuck can decide.

Count of entries still to do, by cause: 125 differ from the rule, 75 have no code, 23 have no test, and 8 failed review (231 in all). 77 UNVERIFIABLE and 23 UNDISCLOSED are held, as above.

| # | Item | Entries | Moves the verdict |
|---|---|---|---|
| 3 | 3 points on the entry side (built; replay and review running) | A-ENTRY-01/-02/-04/-14/-15, A-STOP-01/-03 | yes |
| 4 | Stops: the 5-point cap, stops placed where Gann places them (under the lowest week or day, 3 points beyond the crossed level), and the remaining A-STOP and C-STOP rules | A-STOP, C-STOP | yes |
| 5 | Buying and selling points: turn the context-only bottoms, tops, halts and accumulation into entries; build the W006 points with no code (old item 6) | A-ENTRY, C-ENTRY | yes |
| 6 | Trend: the rules that differ, plus "never too high to buy" over the coarse reversion pass (Gann's precedence) | A-TREND, C-TREND | yes |
| 7 | Time: counts, fractions, anniversaries and bear-market durations act on the verdict where Gann acts on them, not as card context only | A-TIME, C-TIME | yes |
| 8 | Volume rules | A-VOLUME | yes |
| 9 | Price and levels | A-LEVELS, A-PRICE, C-LEVELS, C-PRICE, C-NUMEROLOGY | yes |
| 10 | Risk and pyramiding: double the unit only when profits equal capital; cut the unit after a loss series, alongside the pause. The pyramid-lot conflict between W006 and W022 is Chuck's call. | A-RISK, C-RISK, A-PYRAMID | yes |
| 11 | Exits, selection and the rest | A-EXIT, A-SELECTION, A-OTHER, C-OTHER | yes |
| 12 | Cycle validation (old item 5) | CYC | no, unless a later item acts on it |
| 13 | Intraday alerts on the same primitives (old item 8) | n/a | intraday only |
| 14 | Docs housekeeping (old item 9) | n/a | no |

Held: astrology (A-ASTRO, C-ASTRO) stays research-only under AGENTS.md decision 7 until Chuck changes that.

Each item that moves the verdict gets a 766-symbol replay against main on a bumped `STRATEGY_VERSION`, and the result goes in its PR.

## Held, not proposed for building
- **77 UNVERIFIABLE** entries wait for your reading of the nine books. When a book lands, each entry it covers is re-checked; the entry text isn't edited, but a new entry can be added if the book states the rule differently.
- **23 UNDISCLOSED** entries are never built.
- **Astrology** entries (W046, W013, W049) stay research-only per AGENTS.md decision 7.
- The **Square of Nine vs W009's D-levels** difference is recorded, not changed (the repo already decided not to "fix" it to the D-levels table).

## Session start, every time (step 5)
`pwd`; read `claude-progress.txt`, `gann_features.json`, `git log -20`; `npm test`; fix any breakage first. Baseline today: 2314 tests passing.

## Appendix: what was left out of the feature list
- 34 tier-A lines the extractor classed as philosophy with no method (e.g. "follow the trend regardless of opinion", "hope is the enemy", W030's devotional statements). "Wait for a trend change before taking profits" (A-EXIT-03) is kept as M-E8.
- W003's four general economic cycles (Kitchin, Juglar, Kondratieff, Kuznets) and W012's Elliott material: not attributed to Gann.
- The full list with reasons is in `docs/gann-feature-map/features_A_notes.md` and `features_C_notes.md`, with the subagents' full findings beside them.
