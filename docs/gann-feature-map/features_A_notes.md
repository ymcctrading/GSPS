# features_A.json: notes

Built 2026-10-15 from `cluster_A_gann_primary.md` (178 rules) and `repo_map.md`. I checked every `gsps_location` against the code at HEAD 06d1124 in /home/claude/GSPS, which I only read. Every existing test cited in `test` was checked by script: its describe and it strings are in the named file. I also ran the Gann suites (`npx vitest run lib/gann lib/analysis lib/risk/__tests__/lossSeries.test.ts lib/__tests__/gann.test.ts lib/__tests__/cycle-ranking.test.ts`): 41 files and 316 tests pass. `passes` is false on every entry, as instructed.

**Totals:** 174 entries. 141 come from cluster A (117 A, 1 B, 23 UNDISCLOSED) and 33 are M- matrix rows (UNVERIFIABLE).

**How tests were cited.** An existing test is cited only when its assertion checks the rule's core mechanism *as GSPS implements it*. Where GSPS differs from Gann, the difference is stated in `gsps_location`. The cited test then shows the GSPS form works; it does not show Gann's literal number is met. If a test touches only a side of the rule (for example a top case when the rule is about bottoms, or "does not throw"), the entry says TO WRITE instead.

## 1. Exclusions: philosophy-no-method (34)

| id | why excluded |
|---|---|
| A-TREND-13 | "Follow the trend regardless of opinion": an attitude, with no mechanism |
| A-TREND-14 | Nothing stops a cycle once it has turned: a belief |
| A-TIME-23 | "Time is the most important factor": a ranking claim with no rule (matrix T1 rests on it) |
| A-TIME-27 | Cycles nest ("wheel within a wheel"): framing only |
| A-TIME-28 | Cycle hierarchy from 4 minutes to 5,000 years: no market rule given |
| A-TIME-38 | "A time and a season for everything": scriptural maxim |
| A-TIME-39 | "What has been will be": the premise of recurrence, not a method |
| A-TIME-41 | Big money is made on long swings: a preference |
| A-TIME-42 | Wars every 20-30 years: an assertion, never measured |
| A-ENTRY-11 | Buy strength, not cheapness: an attitude (the mechanical form is A-TREND-09) |
| A-ENTRY-12 | Buy when the news is worst: sentiment, with no signal |
| A-ENTRY-13 | Wait for a definite signal: the mechanical form is A-TIME-09 |
| A-EXIT-03 | Wait for a trend change before taking profits: kept as M-E8 so it is not lost |
| A-EXIT-06 | Stop when the tide turns: an attitude (relates to lossSeries) |
| A-RISK-05 | Safety first, keep reserves: general advice |
| A-RISK-06 | Outright buying pays only under $10; know what you'll do if wrong: no rule |
| A-RISK-09 | Failed speculators kept their losers: an observation |
| A-RISK-10 | Hope is the enemy: psychology |
| A-RISK-11 | No inside information; take small losses: advice |
| A-RISK-12 | Don't try to make money too fast: advice |
| A-RISK-14 | Five qualifications: education (matrix H1, K6) |
| A-RISK-15 | Have a plan and prove the rules: advice |
| A-VOLUME-01 | Volume is the driving power: a premise (the rules are VOLUME-02 to -13) |
| A-ASTRO-09 | Apply the same planetary rules to any commodity: no method |
| A-ASTRO-12 | The novel's astrology is characterisation only |
| A-ASTRO-13 | Gann cast horoscopes (a 1923 reporter's account): no method |
| A-SELECTION-05 | Change with the times, favour new industries: no rule |
| A-SELECTION-09 | Real estate stocks move up last: a remark |
| A-OTHER-01 | When everybody is convinced, it is already discounted: sentiment |
| A-OTHER-02 | The public is always wrong: psychology |
| A-OTHER-03 | History repeats as the balancing of time and price: framing |
| A-OTHER-09 | One law, three applications: philosophy |
| A-OTHER-10 | Deal with causes, exact proportion: philosophy |
| A-OTHER-11 | An angry man has bad judgment: psychology |

## 2. Merges (3)

- **A-TIME-08 ← A-SELECTION-06.** Each stock keeps its own time period, and independent movers can go against their group. The SELECTION-06 wording is folded into the rule text.
- **A-TIME-12 ← A-EXIT-01.** The three-adverse-closes time stop. The source is W006 p.23 for both.
- **A-VOLUME-07 ← A-VOLUME-02.** I kept the first id as the pair was written ("VOLUME-07/VOLUME-02"). The merged entry quotes both Rule 1 (pp.39-40) and Rule 7 (p.48), so its source is "W006 p.48 (Rule 7); W006 pp.39-40". If the caller meant the first id in table order, rename it A-VOLUME-02. Nothing else changes.

Other conventions:
- **Class B and mixed tiers.** A-OTHER-08 cites W022 (A) and W010 (B); it is classed A because the primary statement is in W022. A-OTHER-10 (A/B) was excluded as philosophy. The only B entry is A-ASTRO-14 (W010).
- **Research-only prefix.** Rows the cluster marks research-only carry the "[research-only, confluence-only]" prefix (16 entries). A-TIME-16 is marked "yes" in the cluster, so it is classed A without the prefix, even though the cluster's notes call it research-only because of a base-rate problem.

## 3. Parity matrix rows → coverage

**Covered by a cluster-A entry, so no M- row was added:**

| row | covered by |
|---|---|
| T1 Time outranks price | A-TIME-23 (excluded as philosophy); A-TIME-15 |
| T2 Count from every major pivot | A-TIME-05, A-TIME-21, A-TIME-08 |
| T9 Counter-move duration prior | A-TIME-01, A-TIME-02, A-TIME-03, A-ENTRY-08, A-ENTRY-18 |
| T13 7/14-day alternation | A-TIME-16 |
| T14 Incorporation anniversary | A-TIME-34, A-TIME-35 |
| T15 Periodogram / harmonic analysis | A-TIME-29 |
| P3 Old tops = support | A-LEVELS-01, A-LEVELS-05, A-TREND-06 |
| P5 Double/triple tops | A-LEVELS-04, A-ENTRY-02, A-ENTRY-03, A-ENTRY-14 |
| P8 Gann angles / 1x1 | A-PRICE-05 |
| R2 Time trend turn (lower top, then break of first swing low) | A-TREND-02, A-TREND-03 |
| R4 Space Rule, greatest reaction exceeded | A-TREND-05 (the converse statement) |
| R5 Over-balance of time | A-TREND-05 (compares duration), A-TIME-01/02 |
| R6 Monthly-low (high) break | A-TREND-11, A-TREND-12 |
| R9 M>W>D hierarchy | A-TREND-01 |
| R10 Stock's own trend | A-TREND-04 |
| R12 Sideways: trade the breakaway | A-VOLUME-10 |
| E1 Cross old swing extreme + lost motion | A-ENTRY-04 (the crossing); the ≈1⅞ lost-motion figure itself is A2.1 and unread |
| E2 3-point confirmation | A-ENTRY-04, A-STOP-03 |
| E3 Stop at entry beyond the level | A-STOP-01, A-ENTRY-01 |
| E4 Hold test | A-ENTRY-04 |
| E5 3 adverse closes | A-TIME-12 |
| E7 Trailing stops | A-STOP-04, A-STOP-05, A-TREND-11 |
| E9 Entry confirmation every path | A-TIME-09 |
| E10 Pyramiding | A-PYRAMID-01 to -05 |
| V1 Normal bottoms drying up; climax exception | A-VOLUME-04, A-VOLUME-06, A-VOLUME-07 |
| V2 Shrinking volume on a lower low | A-VOLUME-04, A-VOLUME-05 |
| V3 Volume vs float | A-VOLUME-08 |
| V4 Shares per point | A-VOLUME-11 |
| K1 Risk ≤10% | A-RISK-02 |
| K2 Series of losses | A-RISK-03 |
| K6 Never trade impaired (A05) | A-RISK-14 (excluded as philosophy; its source is readable, so no M- row) |
| H1 Five qualifications | A-RISK-14, A-RISK-15 (both excluded as philosophy) |
| H3 Early/late leaders | A-SELECTION-02, A-SELECTION-03 |
| H4 Never buy one to follow another | A-TIME-08 (with the merged SELECTION-06) |
| H5 Dated forecasts | A-TIME-15, A-OTHER-13 |
| S1 Planetary averages | A-ASTRO-05 |
| S2 Active angles | A-ASTRO-02, A-ASTRO-06 |
| S3 Jupiter-Saturn, Saturn return, Mars half-return | A-ASTRO-04, A-ASTRO-07 |
| S5 Sacred numbers | A-OTHER-07 |
| S6 Name/letter numerology, ad hoc price-degree scales | A-OTHER-08, A-ASTRO-01 |
| S7 Master Time Factor | A-TIME-10 |

**Added as M- rows (33).** All of these rest only on unread sources. T3, T4, T5, T6, T7, T8, T10, T11, T12, T16, T17, T18, P1, P2, P4, P6, P7, P9, P10, R1, R3, R7, R8, R11, E6, E8, E11, E12, K3, K4, K5, H2, S4.

Partial overlaps worth knowing:
- M-T3 overlaps A-TIME-04 (1-3 years) and A-TIME-11 (20 years).
- M-T5 and M-T8 overlap A-TIME-18 (W036's grain dates).
- M-T6 overlaps A-TIME-30 (360/180).
- M-T10 is limited to the 6th-7th-week boiling point. The halt and weekly-reaction parts are A-ENTRY-01 and A-ENTRY-08.
- M-T12 overlaps A-TIME-09.
- M-P10 overlaps A-LEVELS-08.
- M-K3 overlaps A-RISK-04 and A-RISK-07.
- M-K5 overlaps A-RISK-13.
- M-E8 is the only home for the excluded A-EXIT-03.

Source codes B01 (T15) and B03 (S3) appear on neither the readable list nor the unreadable one. Both rows were already covered by A entries, so this did not matter.

## 4. Where GSPS conflicts with Gann's text

The most significant come first.

1. **"3 points" at entries, stops and level tests is still 0.3%.** W006 (A-ENTRY-04, -15, -01, -02, A-STOP-01, -03) puts the crossing and the stop 3 points beyond the level, and calls 3 the safest. In GSPS, `lib/lifecycle/entryConfirmation.ts:80` (`DEFAULT_CONFIRMATION_BUFFER_PCT = 0.3`) and `lib/gann/entryTrigger.ts:97` (`LOST_MOTION_BUFFER_PCT`) set both the trigger and the stop beyond the protective swing (`computeGannEntryTrigger`). The same 0.3% is reused by the halt stop (`lib/gann/timeRules.ts:52`), the double/triple-top "crossed" test (`lib/gann/multipleTops.ts:68`), the accumulation range (`lib/gann/accumulation.ts:52`) and the pyramid add trigger (`lib/gann/pyramid.ts:109`). `pointScale.ts`'s own header records 0.3% as "about a tenth" of Gann's 3 points. Only the exits and stopBreach were moved to the price-scaled figure. For the entry crossing, the A2.1 "lost motion ≈1⅞, never 3" reading may justify a smaller margin, but A2.1 is unread here. The halt stop (timeRules) and the top-crossing test (multipleTops) state 3 points in their own headers and still use 0.3%.
2. **The maximum stop is wider than Gann's 5-point cap** (A-STOP-02). `lib/strat/levels.ts:153-154` allows stops 3-15% from entry, and `:191` allows 20% for large caps. Five points on pointScale's curve is about 11.8% at $42.50 and 6.25% at $200. Gann also sets stops 1-3 points beyond the level, while `levels.ts:157` uses a 0.5% buffer beyond the nearest support.
3. **Pyramid lot sizing** (A-PYRAMID-02). W006 Rule 5 uses equal lots and halves the unit only after the 4th or 5th lot. `lib/gann/pyramid.ts:112` halves every add from the second lot, and `:50` (`MAX_LOTS = 4`) stops adding entirely. This follows W022 p.198 (A-PYRAMID-05, largest lot first), so the conflict is between Gann's own texts as well as between GSPS and W006. The add interval is one risk unit (`pyramid.ts`), where Gann uses 5 or 10 points by price band (A-PYRAMID-01).
4. **The coarse reversion pass rewards extension** (A-TREND-09). Gann says a stock is never too high to buy while its trend is up. `lib/marketScan.ts:416-429` (`coarseReversion`) adds coarse score the further price is from its 50-bar range midpoint, and takes the trade against the extended trend. The continuation pass (`:505-525`) does follow the trend.
5. **Losses: a pause instead of a smaller unit** (A-RISK-03). W006 says reduce the unit after 2-3 losses. `lib/risk/lossSeries.ts` pauses new entries after three losses and relies on percentage sizing for the reduction. Gann's sentence is truncated in the transcription.
6. **Unit increase** (A-RISK-04, M-K3). Gann doubles the unit only once profits equal capital, and A04 Rule 24 says not to raise size after a winning run. `lib/risk/dynamic-risk.ts:resolveRiskBand` raises the risk band after 20 and 40-50 completed trades plus execution score. The roadmap K3 row says "nothing raises it on results". That holds for P&L, but the bands do step up with trade count and score, so it should be re-checked.
7. **Dates over price** (A-TIME-15). Gann acts on the forecast date regardless of price. GSPS keeps all calendar windows as context only (AGENTS.md, F4). This is a recorded, deliberate divergence.
8. **One calendar for all symbols** (A-TIME-19). W036 keeps separate calendars for rails and industrials. `lib/gann/timeCycles.ts:119-132` (`FIXED_CALENDAR_WINDOWS`) fires the same dates for every symbol.
9. **Specialisation** (A-RISK-08). W022 says trade two or three markets. GSPS scans hundreds of symbols and caps only new positions per day (`lib/risk/config.ts:59`) and correlated groups (`:64`).
10. **Scheduled reports** (A-TIME-36). In W022, scheduled reports are turn dates. `lib/signals/regime.ts:45,76` puts a `scheduledBinaryEvent` into the stand-aside "event" regime.
11. **Smaller differences** (scaled or relocated, not contradicted):
    - Counter-moves are compared with the campaign's greatest counter-move, not the preceding one (A-TREND-05, `campaignLedger.ts`).
    - Trails run under 3-Day Chart bottoms and the prior month's low, not weekly bottoms or 5/10 points under the daily high (A-STOP-04, -05, `exitRules.ts`).
    - Volume "drying up" uses 5 bars against 20, not "the smallest in years" (A-VOLUME-09, `volumeClimax.ts:103`).
    - The angle scale is ATR, not points per month (A-PRICE-05).
    - Level bands are 1%, not 3 points (A-LEVELS-06, `multipleTops.ts:34`).
    - Break-even comes after one risk unit, not 3-4 points (M-E6).
    - 60% is still taken at TP1 under "never fix a target" (M-E8, `protocol-exit.ts`).

Not a conflict, but noted:
- A-RISK-02 (≤10% of capital per trade): GSPS is stricter, at 1-2% (`lib/risk/config.ts`).
- The repo-map errata for `docs/memory-bank/sources/A2_3_coffee_letter_1954.md` (4700 vs 8700, 6572 vs 8572, the scale list) are documentation errors. No code reads them.

## 5. Rules with no implementation (gsps_location "none"): 51

**Implementable Gann rules with no code (18).**
- A-TIME-06 (bear-market durations of 30-36 and 40-43 months)
- A-TIME-19 (per-group calendars)
- A-TIME-22 (recurring monthly dates)
- A-ENTRY-05 (crossing the previous year's top)
- A-ENTRY-06 (new all-time highs)
- A-ENTRY-09 (older tops weigh more)
- A-ENTRY-10 (holding the all-time low)
- A-ENTRY-17 (breaking the previous year's bottom)
- A-ENTRY-19 (narrow week, then a sharp drop on volume)
- A-EXIT-04, A-EXIT-05 (yes-example)
- A-PYRAMID-07 (yes-example)
- A-RISK-07 (profit-based 10% ceiling)
- A-RISK-08 (specialisation)
- A-VOLUME-12 (largest weekly volume since a top)
- A-PRICE-06 (expected annual range)
- A-SELECTION-07 (small float for shorts)
- A-SELECTION-08 (futures contract month): an intentional exception, since GSPS has no futures

Also with no direct implementation: A-TIME-07 (research-only) and A-OTHER-08 (excluded by policy).

**Research-only with no code (13 + 1 B).**
- A-TIME-31, -32, -33. The closest analogue to TIME-32 is the research-only `squareOf20.ts`.
- A-ASTRO-01 to -08, and A-ASTRO-14 (class B).
- M-S4 (excluded).

**Undisclosed with no code (18).** A-TIME-10, -13, -14, -20, -24, -25, -26; A-RISK-16; A-PRICE-03, -04; A-LEVELS-07; A-ASTRO-10, -11; A-OTHER-04, -05, -06, -12, -14.

Five UNDISCLOSED entries do have a GSPS stand-in: A-TIME-29 (`spectralCycle.ts`), A-TIME-34 and A-TIME-35 (`incorporationCycle.ts`), A-TIME-40 (`timePriceSquare.ts`), and A-LEVELS-08 (`evenFigures.ts`).

**Context-only implementations.** Many implemented entries act only as context or the confluence card and never on a verdict, plan or exit. This matches repo_map §3 items 7-8. They are:
- the counter-move clock, time rules, multiple tops, leadership, accumulation, shares-per-point and the cycle squares
- the halt and weekly rules behind A-ENTRY-01 and -08
- the double and triple bottoms behind A-ENTRY-02 and -14
- A-SELECTION-02 and -03

## 6. Test coverage

- **Existing tests (76):** 44 A, 3 UNDISCLOSED stand-ins and 29 M-.
- **TO WRITE (98).** This includes 20 UNDISCLOSED entries that are marked "not testable" until the method is found, and a few that are not applicable.

The weakest-covered implemented rules:
- `campaignLedger.monthlyBreak` (A-TREND-11, -12): there is no test for it.
- `leadership.toppedFirst` (A-SELECTION-03, A-TIME-08).
- The bearish counter-move clock (A-TIME-02).
- Readings at the top: `volumeClimax` high-anchor heavy volume and a secondary top on lower volume (A-VOLUME-07, -13). `volumeRule.test.ts` tests lows only.
- `sharesPerPoint.topWarning` (A-VOLUME-11). Its only test asserts "returns a reading or null without throwing".
- `combineNearbyLevels` (M-P4).
- `macroBreadthAgrees` taking no index input (A-TREND-04).
- No test asserts that a GSPS stop stays within Gann's 5-point cap (A-STOP-02).
