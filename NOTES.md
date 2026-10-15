# NOTES: where GSPS computes each Gann element (step 1, read-only exploration)

Written 2026-10-15 on branch `claude/gann-feature-map-01fckp`, from `main` at `06d1124` (#305).
No code was changed. This file, `gann_features.json` and `PLAN.md` are the only additions.

## Session baseline

| Check | Result |
|---|---|
| `pwd` | `/home/claude/GSPS` |
| `claude-progress.txt` | does not exist yet (created by the first build item) |
| `npm ci` then `npx vitest run` | **233 files, 2314 tests, all passing** (40 s) |
| `STRATEGY_VERSION` | `2026-09-30-stop-breach-retired` (`lib/backtest/strategyVersion.ts:48`) |

Commands: `npm test` (vitest), `npx tsc --noEmit`, `npm run lint`, `npm run check:terms`.

## Where the rules came from

The Gann rules were taken from the reading output in the project's shared folder,
`/mnt/project-files/literature-reading-output/` (read-only here; the reading thread owns it).
Four read-only subagents each covered one source cluster:

| Cluster | Works | Rules extracted |
|---|---|---|
| Gann's own text (tier A) and press reports (tier B) | W006, W022, W036, W046, W001, W030; W010 | 178 |
| Secondary and vendor work on Gann (tier C) | W003/W034, W007, W009, W011, W013, W023, W027–W029, W031–W035, W048–W050 | 121 |
| Cycle science | W039–W045 | 52 |
| GSPS code and the parity roadmap | `lib/`, `docs/memory-bank/GANN_PARITY_ROADMAP.md` | 73 matrix rows mapped |

Rules are cited by work ID and page, as the reading notes cite them (PDF pages unless the notes give printed pages).

### Source classes (the `class` field in `gann_features.json`)

| Class | Meaning |
|---|---|
| `A` | Gann's own text, read in the current reading output |
| `B` | Press or publisher report about Gann, read |
| `C` | Secondary or vendor work attributing the rule to Gann, read |
| `CYCLE` | Cycle-science validation standard (Dewey, Halberg, Tomes), read |
| `UNVERIFIABLE` | Rests on a source not readable in the current reading (the nine blocked books, or a book not in the collection). Recorded per step 10, not inferred |
| `UNDISCLOSED` | Gann names the technique but never explains it. Cannot be built without inventing it |

Status vocabulary for `passes`: `false` until a test that asserts the rule as written has been run and shown passing, and a fresh reviewer has checked it. Only `passes` may change.

### How the repo's source codes map to this reading

The repo's memory bank (`docs/memory-bank/sources/`, 2026-09-27) uses its own codes. The parity roadmap cites those codes.

| Repo code | Work | Readable now? |
|---|---|---|
| A03 *Tunnel Thru the Air* | W022 | yes |
| A05 *New Stock Trend Detector* | W006 | yes |
| A10 *The Magic Word* | W030 | yes |
| A11 *Economic Forecaster* | W001 | yes |
| A2.2 *Annual Forecasts 1919–22* | W036 | yes |
| A2.3 Coffee letter 1954 | W046 | yes |
| A02 *Truth of the Stock Tape* | W015 | **no** (blocked) |
| A08 *How to Make Profits in Commodities* | W008 / W019 | **no** (blocked) |
| A09 *45 Years in Wall Street* | W005 | **no** (blocked) |
| A2.1 *Master Stock Market Course* | W037 | **no** (blocked) |
| B04 Reddy, *Trading Methodologies* | W014 | **no** (blocked) |
| B05 Mikula, *Scientific Methods Unveiled* Vol. 2 | W004 | **no** (blocked) |
| A04 *Wall Street Stock Selector*, A01 1909 *Ticker* interview, A07 *Face Facts America!* | not in the collection (A01 is quoted second-hand in W027–W029 and W001) | **no** |

**The main finding of this step:** most of the parity roadmap's "Aligned" rows cite A02, A04, A08, A09 or A2.1. None of those can be checked against the current reading. Where a rule also appears in a readable Gann work (mostly W006), it is entered under that work. Where it does not, it is entered as `UNVERIFIABLE` with an `M-` id and stays so until Chuck's reading of the nine books lands.

## Element map (code, surfaces, tests)

Surfaces: LIVE = `lib/scanTicker.ts` / `lib/marketScan.ts`; REPLAY = `lib/backtest/replay.ts`; EXITS = `lib/trade/protocol-exit.ts`, `gann-exit-live.ts`; CARD = `lib/signals/confluence/gann.ts`; DR = through `lib/gann/disclosedRules.ts`.

| Element | Code | Surfaces | Tests |
|---|---|---|---|
| Swing charts (3-Day, 7-day weekly) | `lib/gann/swingChart.ts` | 17 consumers; LIVE, REPLAY, score, regime | `swingChart.test.ts` (17) |
| Trend confirmation / range | `lib/gann/trendStrength.ts` `readGannTrend` | `analysis/trend.ts`, regime, range states | `trendStrength.test.ts` (7) |
| Monthly/weekly/daily trend | `lib/analysis/trend.ts` `readTrend` | LIVE, REPLAY | **none** |
| 7/30/365 power ratio | `lib/gann/timeframeWeight.ts` | entry selection | `timeframeWeight.test.ts` (5) |
| Entry trigger (old swing extreme + lost motion) | `lib/gann/entryTrigger.ts` | LIVE, REPLAY, automation, exits | `entryTrigger.test.ts` (9) |
| Entry confirmation (buffer 0.3%) | `lib/lifecycle/entryConfirmation.ts`, `confirmNow.ts` | plans, replay, every order path | `entryConfirmation.test.ts`, `confirmNow.test.ts` |
| Breakaway from a range | `lib/gann/breakaway.ts`, `applyBreakawayHold` | LIVE, REPLAY | `breakaway.test.ts` (5) |
| Stop breach, failed-break reclaim | `lib/gann/stopBreach.ts`, `lib/lifecycle/retire.ts` | LIVE, REPLAY | `stopBreach.test.ts` (21), `retire.test.ts` (11) |
| Gann's 3 points, price-scaled | `lib/gann/pointScale.ts` | exits, stop breach, intraday replay | `pointScale.test.ts` (3) |
| Gann exits | `lib/gann/exitRules.ts` `readGannExit` | EXITS (live), REPLAY | `exitRules.test.ts` (12), `protocol-exit.test.ts` (26) |
| Pyramiding | `lib/gann/pyramid.ts` | REPLAY, suggestion route; not automated | `pyramid.test.ts` (3) |
| Rule of Three | `lib/gann/ruleOfThree.ts` | score, LIVE, REPLAY | `ruleOfThree.test.ts` (7) |
| Angles, fans | `normalizedSlope.ts`, `fans.ts` | score, LIVE, REPLAY, CARD | `normalizedSlope.test.ts`; fans only in `lib/__tests__/gann.test.ts` |
| Range divisions, 50% point | `lib/gann/retracement.ts` | score, coarse gates, states | `retracement.test.ts` (6) |
| Square of Nine | `lib/gann/squareOf9.ts` | LIVE, REPLAY, CARD | only `lib/__tests__/gann.test.ts` |
| Time = price | `lib/gann/timePriceSquare.ts` | score | `timePriceSquare.test.ts` (5) |
| Volume at turns | `lib/gann/volumeClimax.ts` | score, pre-filter | `volumeClimax.test.ts`, `volumeRule.test.ts` |
| Levels, stops, targets | `lib/strat/levels.ts` | plans, REPLAY | `equity-levels.test.ts` (20) |
| Even figures | `lib/gann/evenFigures.ts` | levels, intraday TP1, UI | `evenFigures.test.ts` (6) |
| Stage A context bundle | `lib/gann/disclosedRules.ts` | LIVE, REPLAY, CARD | `disclosedRules.test.ts` (13) |
| Campaign ledger (over-balance, sections) | `lib/gann/campaignLedger.ts` | trend verdict, exits | `campaignLedger.test.ts` (5) |
| Time cycles, calendar, day bands | `lib/gann/timeCycles.ts` | LIVE ranking, REPLAY, CARD | no dedicated file; `cycle-ranking.test.ts`, `gann.test.ts` |
| Nine context-only modules (extremeRules, timeConvergence, timeRules, multipleTops, seasonalCounts, accumulation, sharesPerPoint, leadership, sevenZones) | `lib/gann/*` | DR only (measured, never acts) | 2–7 tests each; four share `missingRules.test.ts` |
| Float volume (D2), inception (D3) | `capitalStock.ts`, `incorporationCycle.ts` | exits (D2), DR | 7 tests each |
| Cycle squares, spectral cycle, macro cycle | `masterTwelve`, `squareOf52`, `angleMonthCounts`, `decadeCycle`, `spectralCycle`, `macroCycle` | CARD (macro also replay context) | own test files |
| Series of losses; position ceilings | `lib/risk/lossSeries.ts`; `position-limits.ts`, `config.ts` | every order path | `lossSeries.test.ts` (3), `position-limits.test.ts` (6) |
| Intraday alerts | `lib/scanner/intraday.ts` | intraday scan | `intraday-scanner.test.ts` (60) |

Scored criteria (`lib/scoring/weights.ts:68`, 9 points, Execute 6 / Watch 3.5) and registry status: `swingChartTrend` quarantined, `gannAngleSlope` quarantined, `stopRoom` quarantined, `volumeClimax` and `timePriceSquare` hypothesis, `historicalSR` validated, `entryTriggerArmed`, `gannRetracementConfluence` and `ruleOfThree` unmeasured.

## Mismatches found (recorded, not fixed)

1. **Entry side still uses a fixed 0.3% buffer.** `DEFAULT_CONFIRMATION_BUFFER_PCT` (`lib/lifecycle/entryConfirmation.ts:80`) and `LOST_MOTION_BUFFER_PCT` (`entryTrigger.ts`) are 0.3%. Exits and stop breach moved to price-scaled 3 points (`pointScale.ts`) on 2026-09-28. W006 pp.20–24 states the 3-point rule for entries as well. Nothing records whether the difference is intended.
2. **The intraday scanner and the intraday replay read different Gann primitives.** `lib/scanner/intraday.ts` imports only `evenFigures`; `replayIntraday.ts` uses `swingChart`, `pointScale` and `stopBreach`.
3. **`readTrend` has no test**, though every macro trend read goes through it. `timeCycles.ts`, `fans.ts` and `squareOf9.ts` have no dedicated test file.
4. **The roadmap's swing-chart row reads Aligned, but `swingChartTrend` was quarantined 2026-09-30** (inverted on six-year runs 12, 22, 23).
5. **`macroCycle.ts` is on `main`**, though AGENTS.md and roadmap row H5 say it is on an unmerged branch. It has no measured record shown with its dated windows, which the forward-claims rule requires.
6. **Nine context-only modules never act** on a verdict, plan or exit. Under the owner's 2026-09-28 rule they are Aligned only in the measuring sense.
7. **Cycle squares and the spectral cycle are card-only**, never measured against outcomes.
8. **`lib/risk/position-limits.ts` and `config.ts` carry no Gann citation** (last changed 2026-08-31).
9. **Stale roadmap text:** "Next step" cells on built rows (T6, T7, P2, P6, R2–R6, R11, E9); T5 says 8 calendar windows, the code has 10.
10. **Cycle code (from the cycle cluster):**
    - no test runs `detectSpectralCycle` on white noise or a random walk (Yule–Slutsky / null case);
    - its hold-out runs only after `active` is decided on the full window, so the hold-out data helps decide whether the hold-out happens;
    - the cosinor p-value is computed after the period was picked from the same data;
    - `timeCycles`, `yearCycleConvergence`, `macroCycle` and `decadeCycle` have no base rate;
    - exact whole-unit periods everywhere (`macroCycle.ts` `yearsElapsed % n === 0`), against Tomes' average-vs-specific distinction (W045) and Benner's drift (W039 p.14);
    - Dewey #5, #8 and #9 are not built anywhere.

## Coffee letter repo note differs from the scan (record only)

`docs/memory-bank/sources/A2_3_coffee_letter_1954.md` covers W046. Against the scan it:
1. gives "40 pts/month ⇒ 4700"; the scan reads **8700** (300 + 40 × 210);
2. gives geocentric Saturn "⇒ 6572"; the scan reads **8572**;
3. gives the 15 May 1940 Saturn as 181°55′; the scan reads **181°35′** (degree digit partly unclear);
4. repeats "50 pts/month" without noting only 30 reproduces 8715;
5. lists scales "1, 12, 30, 45, 46, 50 pts per degree"; no 46 is in the letter, and the 50 is per month.

It also repeats three of Gann's own slips unflagged (8663 = "28° Aries", Jupiter "20°35′", 30 × 210 + 300 "= 5600"). Not corrected; this is an owner decision (unresolved-items §6 q.3).

## Conflicts between sources (affect how a rule is written)

- W006 p.20 vs p.46: a single bottom holds 2–3 weeks vs 1–3+ weeks.
- W006 Rule 2 vs Rule 4: a short's stop trails 1, 2, 3 or 5 points above weekly tops vs 1 point.
- W006 Rule 5 vs W022: equal pyramid lots halved after the 4th–5th vs largest lot first. W006's pyramid steps cover only $20–50 and $80–200.
- W006 p.13: bear markets "no more than 43 months", while listing one of 53.
- W022 p.371 vs p.372: a "time" is 360 units vs 20 years.
- Pivot counts (W006, W022, W046) vs fixed calendar dates (W036); never reconciled by Gann.
- W036 p.22 "trade the dates regardless of price" vs GSPS keeping calendar windows as context only.
- Secondary: 3-point penetration (W003, W006) vs 1 point (Jensen W049); W031 vs W033 angle-to-fraction pairing; W034 41 vs W003 46 weeks (46 is right).
- W006's transcription truncates Ch. VII Rule 1 and omits the Chrysler record, so rules depending on those passages are partly unverifiable.

## Not entered as features

Rules the extractors marked "philosophy, no method" (34 from tier A, e.g. W030's devotional statements) and the general economic-cycle and Elliott material in W003 and W012 are listed in the agents' notes but are not features: there is nothing to test. The exact exclusions, with reasons, are in `docs/gann-feature-map/features_A_notes.md` and `features_C_notes.md`. The four subagents' full findings are beside them.
