# features_C.json: notes

Companion to `features_C.json` (168 entries: 116 cluster-C rules, 52 cycle rules CYC-01..CYC-52). Code was checked read-only at `/home/claude/GSPS` HEAD `06d1124`. Tests were not run. Every `passes` is `false` by instruction. A test is cited as existing only where I read its body or name and it asserts the rule as GSPS implements it. Where an existing test covers only part of a rule, the entry says TO WRITE and names the missing part.

## 1. Exclusions (5 rules not entered)

| id | why excluded |
|---|---|
| C-TIME-28 | W003 section B: Kitchin/Crum/Mogey 40-month stock cycle. General economic-cycle literature, not attributed to Gann. |
| C-TIME-29 | W003 section B: Juglar 9–11-year cycle. Not attributed to Gann. |
| C-TIME-30 | W003 section B: Kondratieff/Schumpeter nest. Not attributed to Gann; Tomes' dated forecast in it is not a rule. |
| C-TIME-31 | W003 section B: Kuznets 16.5–18-year cycle. Not attributed to Gann. |
| C-OTHER-05 | W012 Ingram: Elliott 5-3 from summed sines. Not Gann, and Elliott is on AGENTS.md's non-Gann sweep list. |

## 2. Labelling decisions

- **UNVERIFIABLE (44 entries).** Rows the cluster file ties to a blocked book. Includes all nine "proofs of resistance" (C-LEVELS-02 to C-TIME-04, which the cluster's closing table assigns to the Master Stock Market Course) and C-TIME-07 and C-TIME-13 to C-TIME-17 (covered by that table's ranges, not by a per-row note).
- **Astrology prefix (19 entries).** Every C-ASTRO row, plus C-TIME-35 (Jupiter–Saturn window), C-NUMEROLOGY-02 (planetary magic squares) and C-LEVELS-25 (vendor "astral points"). Two of these carry a Gann attribution and are also UNVERIFIABLE: C-ASTRO-01 (W003's planetary table) and C-ASTRO-02, which Awodele quotes from an unidentified Gann course "How to Forecast". For C-ASTRO-02 the "not sourced to Gann" in the prefix means "not yet traced to a Gann text".
- **Blocked books that GSPS already cites as Tier A.** The cluster treats *45 Years in Wall Street*, *How to Make Profits in Commodities*, *Truth of the Stock Tape* and the Master Course as unread. GSPS code cites all four as read Tier-A sources, for example `lib/gann/timeCycles.ts:72` (45Y Rule 8), `lib/gann/extremeRules.ts:4` (*Commodities* 1951), `lib/gann/sevenZones.ts:2` (*Truth of the Stock Tape* Ch. XI) and `lib/gann/campaignLedger.ts:13-19`. So several UNVERIFIABLE rows can probably be checked against `docs/GANN_HISTORICAL_SOURCES.md` and `docs/memory-bank/sources/` without reopening the PDFs. Do that before you treat them as unresolvable. The strongest candidates are C-TREND-03/06 (over-balance), C-TIME-05 (seasonal dates), C-TIME-24 (decade digits) and C-LEVELS-11 (50%).
- **Untestable rows.** 16 entries say "TO WRITE: none — <reason>". These are principles, taxonomies, withheld keys or out-of-scope forecasts (for example C-TIME-11, C-OTHER-03, C-OTHER-04, C-LEVELS-25 and CYC-23). CYC-18 and CYC-19 are "n/a — does not apply to markets".

## 3. Conflicts between sources

1. **Breaking an angle.** W003 (C-STOP-02) says that breaking the 1x1 sends price to the next angle. Sidney, W031 (C-LEVELS-19), calls that a misunderstanding. GSPS projects no next-angle target, which matches Sidney by absence.
2. **Angle-to-fraction pairing.** Sidney's own two lessons disagree. W031 (C-LEVELS-18) pairs 1x2 with a 3/8 price retracement. W033 (C-TIME-40) pairs 1x2 with 50% of time. GSPS's `fans.ts` time projection follows W033 (1x2 = 50%).
3. **Calendar dates vs counts from pivots.** W003 (C-TIME-05) and W023 (C-TIME-37) use fixed seasonal dates. W035's quoted passage (C-TIME-43) says to count from extremes, "not from exact seasonal or calendar time periods". GSPS does both side by side (`FIXED_CALENDAR_WINDOWS` and `seasonalCounts.ts`, alongside the pivot counts).
4. **Seasonal step size.** The SQ9 calendars (C-TIME-37) step 22.5°. The "Square of Four" (C-TIME-38) steps 15°. GSPS `seasonalCounts.ts` steps 45° and adds thirds.
5. **Penetration allowance.** W003 (C-STOP-01) and Gann give 3 points. Jensen (C-STOP-04) gives 1 point. GSPS uses three different figures, and none of them is 1 point:
   - a price-scaled 3 points for stops and exits (`stopBreach.ts:108`, `pointScale.ts`);
   - 0.3% at entry (`lifecycle/entryConfirmation.ts:80`, aliased at `entryTrigger.ts:97`);
   - 0.3% for crossing a double or triple top (`multipleTops.ts`).
6. **Square-of-Nine step (W009 vs GSPS).** W009 (C-LEVELS-14) gives 45° levels as (n + k/8)². That is a 1/8 root step per 45°, so a 360° turn adds 1 to the root. `squareOf9.ts:42` uses root + deg/180: a 45° step adds 0.25 and a 360° turn adds 2. The 0.25 step is the conventional one, and the existing test asserts it (`lib/__tests__/gann.test.ts` > squareOf9Levels > "produces the classic 360° doubling relationship"). Either W009 labels 22.5° steps as 45°, or it uses a different convention. The cluster note calls W009 "already in GSPS SQ9 code", but by this arithmetic it is not.
7. **Day counts.** W003 C-TIME-06 lists 30, 60, 150, 210 and 330 and leaves out 120, 240 and 270. W003 C-TIME-10 and W035 C-TIME-44 include 120, 240 and 270. GSPS `WHEEL_COUNTS` (`timeCycles.ts:69`) matches C-TIME-10 exactly.
8. **Errata carried from the cluster.**
   - W034 gives 1/64 of 144² as 41 weeks. 46 is correct.
   - W003's planetary periods are wrong for Mercury (should be about 87.97 d) and Neptune (about 164.8 y).
   - W011 calls 45° "trine".
   - Bucholtz's Table 3-2 is mislabelled, and his Coca-Cola MC dates conflict.
   - Jensen's Plate 1 gives X–G as 54½° where 52½° is right.
   - Sidney's text says 2x1 "falls" where "rises" is meant.

## 4. Where GSPS conflicts with a rule (file:line)

| rule | GSPS | conflict |
|---|---|---|
| C-TIME-05 | `lib/gann/timeCycles.ts:119-132` | Windows are Feb 8–10, May 3–7, Jul 22–24, Nov 8–11 and Nov 21–23. W003 has 5–6 Jan, 5 Feb, 6 May and 7 Jul. |
| C-TIME-06 | `lib/gann/timeCycles.ts:69` (WHEEL_COUNTS), `:76-86` (bands) | 210 and 330 days are never windows. 30, 60 and 150 appear only through bands. |
| C-TIME-08, C-TIME-21 | `lib/gann/squareOf52.ts:68-82` | 35, 45 and 78 weeks are absent. |
| C-TIME-20, C-TIME-26 | `lib/gann/timeCycles.ts:112` (MAJOR_CYCLE_YEARS) | No 90-year or 6-year cycle and no 59th month. The 1-year "smallest cycle" contradicts W003's 5-year one. |
| C-TIME-25 | `lib/gann/disclosedRules.ts:291-296` (counterMovePhase, normal ≤ 21 days); `lib/gann/extremeRules.ts:41-42` | W003's normal counter-move is 3–5 days. GSPS's "7–10 Day Rule" measures something else (days with no lower low). |
| C-TREND-08 | `lib/gann/ruleOfThree.ts:37-39` | W035 says 4 consecutive higher weekly closes. GSPS signals after 2 higher closes (3 lower). |
| C-PRICE-02 | `lib/gann/disclosedRules.ts:143-150` | Eighths of the low stop at 2× the low. W003 lists 3×, 4×, 7×, 9× and 12×. |
| C-LEVELS-14/15 | `lib/gann/squareOf9.ts:42` | See conflict 6. GSPS has no 22.5° rays and no CF/Step wheel. |
| C-LEVELS-18, C-TIME-40 | `lib/gann/fans.ts:37-43` | The ANGLES list omits 1x8, 1x3, 3x1 and 8x1. |
| C-LEVELS-20, C-LEVELS-08, C-TIME-04 | `lib/gann/fans.ts`, `normalizedSlope.ts`, `timePriceSquare.ts` | One unit is one ATR per trading bar. The rules use a fixed price per calendar day, so the geometric square from a high never reaches 0. |
| C-TIME-34 | `lib/gann/spectralCycle.ts:225` | Input is log daily closes, not the weekly (H+L)/2. |
| C-TIME-37/38 | `lib/gann/seasonalCounts.ts:40-51` | 45° and thirds only. |
| C-TIME-24 | `lib/gann/decadeCycle.ts:76-80` | Digit 8 has no 90th-month note. Only 4 of the 10 digits are tested. |
| C-PRICE-01 | `lib/signals/states/trendBreakout.ts:321-322` | Measured move = trigger + base range, and only as a fallback. The rule adds the prior swing's range to the new swing's start. |
| CYC-01, CYC-13 | `lib/gann/spectralCycle.ts:256` | `active` = dominance ≥ 3 and not at the band edge. Chance (Schuster p, line 259) is reported but not required. |
| CYC-08, CYC-32/33 | `lib/gann/spectralCycle.ts` | The hold-out runs only when `active`, and `active` is decided on the full window. The cosinor p is computed at the period scanned from the same data. |
| CYC-09, CYC-43 | `lib/gann/macroCycle.ts:123`; `lib/gann/timeCycles.ts:286` | Exact integer multiples and an exact-month match. Benner and Tomes warn that fractional or mixed intervals drift. |
| CYC-39 | `lib/gann/timeCycles.ts:205` | The direction is fixed by anchor kind (a low means bullish). |
| CYC-47 | `lib/gann/macroCycle.ts:computeMacroCycle` | Projects dated windows up to 60 years ahead with no measured record attached, which AGENTS.md's forward-claims rule requires. |
| CYC-24, CYC-51 | `lib/gann/timeCycles.ts:172-243` | `timeCycles()` joins about 21 counts × 12 anchors + 9 bands with no base rate and no multiple-comparison correction. |

## 5. Rules with no implementation

Entries whose `gsps_location` starts with "none" (several still name related code with "— differs").

- **Cluster C, Gann-attributed (non-astrology):** C-ENTRY-01, C-TREND-01, C-TREND-05, C-OTHER-02, C-LEVELS-04, C-LEVELS-05, C-LEVELS-10, C-STOP-02, C-TIME-14 (Square of 90), C-TIME-23, C-NUMEROLOGY-01, C-LEVELS-12, C-LEVELS-18, C-OTHER-03, C-OTHER-04.
- **Jensen geometry:** C-PRICE-04, C-LEVELS-22, C-LEVELS-23, C-LEVELS-24.
- **All astrology:** C-ASTRO-01 and C-ASTRO-03 to C-ASTRO-16, C-TIME-35, C-NUMEROLOGY-02, C-LEVELS-25. GSPS has no ephemeris or planetary code anywhere in lib/, app/ or components/. That matches AGENTS.md: astrology is research-only and nothing is built until a citable technique is specified. C-ASTRO-02 is the exception in kind, mapped only to the bare 30-year count. C-ASTRO-09 and C-ASTRO-13 point at `incorporationCycle.ts` as the nearest non-astro analogue.
- **Partly present but missing the rule's core:**
  - C-TIME-03: cycle date + range + volume, never combined.
  - C-TIME-12: fractions of multi-year cycles.
  - C-TIME-17: 144² in days, weeks, months and years.
  - C-TIME-27: campaign-length ceiling and the 23rd month.
  - C-SWING-01, C-TREND-04, C-TREND-07: the campaign ledger records legs but never compares them.
  - C-ENTRY-03: count of higher bottoms.
  - C-ENTRY-04: the retest of 50% as an entry.
- **Cycle rules with no implementation:**
  - CYC-06 (phase resumption) and CYC-10 (interior hold-out).
  - CYC-14 to CYC-17 (cross-series criteria).
  - CYC-22 (forced vs free), CYC-25 to CYC-26 (interval randomness, regularity index).
  - CYC-34 (period CI), CYC-35 (phase pooling), CYC-37 (beats).
  - CYC-45 (out-of-sample precision) and CYC-46 (homogeneity).

## 6. Test caveats found while reading

- `lib/research/__tests__/calendarTest.test.ts` > "scores a series and applies Holm" asserts only the instance count, that p > 0, and that `holmSignificant` is a boolean. It does not show that Holm corrects anything, or that a hit rate beats its base rate. So CYC-24, CYC-42 and CYC-51 are TO WRITE, although the cluster file listed this test as existing.
- `lib/gann/__tests__/extremeTiming.test.ts` > "reports days from the last pivot..." asserts only that `alternation` is non-null, never which of 7/14/21 it lands on (C-TIME-18).
- `lib/gann/__tests__/disclosedRules.test.ts` > "builds eighths of the low..." asserts the label and importance of "100% above the low" but not its price (C-PRICE-03).
- `lib/gann/__tests__/spectralCycle.test.ts`:
  - It has no white-noise or random-walk fixture (CYC-28). Every "inactive" case is a flat series or a deterministic trend.
  - It has no test of the false case for `periodConsistent` or `windowStable`.
- `lib/gann/__tests__/decadeCycle.test.ts` tests digits 1, 7, 9 and 0 only.
- `timeCycles.ts` still has no test file in `lib/gann/__tests__/`. Its coverage is in `lib/__tests__/gann.test.ts` and `lib/__tests__/cycle-ranking.test.ts`.
