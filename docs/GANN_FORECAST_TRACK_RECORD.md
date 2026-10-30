# Gann's dated forecasts: the measured track record

Internal research record (2026-10-30). It cites the confidential sources and
must never be shown to a member. Roadmap: Q2, Track M ("the dated-forecast
example with its documented record", `docs/SYNTHESIZED_ROADMAP.md`).

AGENTS.md "Forward-looking claims" allows a dated window on the platform only
with its source, its method and its measured record written down and linked
where it is shown. This file is that record for two things: Gann's own
published annual forecasts, and the macro cycle (`lib/gann/macroCycle.ts`)
that produces the 2027–2029 window the owner cited.

- Code: `lib/research/forecastTrackRecord.ts`, `lib/research/publishedForecasts.ts`.
- Data: `lib/research/dowSwingRecord.json`, built by
  `scripts/parse-dow-swing-record.py` from the W009 transcriptions.
- Run: `docs/replay-runs/2026-10-30-forecast-track-record.json`, made by
  `node scripts/forecast-track-record.mjs --out <file>`. Its test
  (`lib/research/__tests__/forecastTrackRecord.test.ts`) checks the run still
  matches the code.

## 1. Where the 2027–2029 window and "2106" come from

The window is `macroCycle.ts` (PR #285, 2026-09-25 to 09-28, branch
`claude/stoic-brown-p296wd`, merged as `6d79ef5`). It counts Gann's
60/50/30/20/15/10/7/5-year hierarchy forward from the five DJIA turns that
Master Course A2.1 Ch. 7 names (Aug 1896, Apr 1897, Nov 1907, Sep 1909,
Sep 1929). Months where four or more lengths land together, from now on:

| Month | Anchor + years | Lengths landing | Expect |
|---|---|---|---|
| Nov 2027 | Nov 1907 low + 120 | 5, 10, 15, 20, 30, 60 | low |
| Sep 2029 | Sep 1909 top + 120; Sep 1929 top + 100 | 5, 10, 15, 20, 30, 60; 5, 10, 20, 50 | high |
| … | (the full list to 2109 is in the run's `projection`) | | |
| Aug 2106 | Aug 1896 low + 210 | 5, 7, 10, 15, 30 | low |

PR #285's description names "Sep 2029 = 1909 top + 120y and 1929 top +
100y". The text "2106" was not found in that session's transcript pages read
on 2026-10-30, in the repo, or in the readings; Aug 2106 is where the same
arithmetic lands (1896 + 210, five lengths), so the earlier "through 2106"
was very likely this list carried that far.

## 2. Gann's own tables used as the outcome record

*45 Years in Wall Street* (1949, W009) prints the Dow Industrials' turns
from 1912 to 1949 in two tables, transcribed in the reading
(`works/W009/transcriptions/`):

- **9-Point Chart Swings** (pp.75-79): every reversal of 9 points or more,
  Gann's own "important" swings. 465 entries parsed.
- **Record of 3-Day Moves** (pp.66-75): the minor swings. 1,425 entries.

Corrections are listed in the JSON's `fixes` (four misprints, each read from
the book's own neighbouring figures or chart). Gaps are the book's: no 9-point
swing between Aug 24, 1921 and Oct 14, 1922, and none in the 1914 closure.

## 3. The published forecasts against those tables

Forecasts carried, with the issue date printed on each: 1919 (16 Dec 1918),
1920 (10 Dec 1919), 1921 (14 Dec 1920), 1922 (30 Nov 1921) from W036; 1929
(23 Nov 1928) from W005; 1932 (21 Oct 1931) as quoted in W001. 52 dated Dow
calls in all. Rules fixed before scoring (`publishedForecasts.ts` header):
industrial calls with a stated day or month only; "about" or single-day calls
widened three days each side; mid-year supplements not scored (no printed
dates); the weekly "dates to watch" lists left out (not transcribed in full).

Base rate for each call: the share of all same-length windows starting in the
same year that would also have caught a turn of that kind. p is the chance of
at least the observed hits at those rates.

| Forecast | 9-point hits / calls | expected by chance | p | 3-day hits / calls | expected | p |
|---|---|---|---|---|---|---|
| 1919 | 2 / 12 | 0.83 | 0.20 | 7 / 12 | 4.80 | 0.14 |
| 1920 | 1 / 6 | 0.58 | 0.47 | 3 / 6 | 2.59 | 0.51 |
| 1921 | 1 / 8 | 0.56 | 0.45 | 4 / 8 | 3.51 | 0.49 |
| 1922 | 1 / 14 | 0.23 | 0.21 | 2 / 14 | 3.61 | 0.91 |
| 1929 | 5 / 9 | 3.14 | 0.14 | 1 / 9 | 2.22 | 0.94 |
| 1932 | 2 / 3 | 0.64 | 0.12 | 2 / 3 | 1.31 | 0.41 |
| **All 52** | **12 / 52 (23%)** | **5.99 (12%)** | **0.006** | **19 / 52 (37%)** | **18.04 (35%)** | **0.44** |

Reading it:

- On Gann's own important (9-point) swings, his published calls hit about
  twice as often as chance (p = 0.006). On the minor 3-day swings they hit no
  more often than chance. The skill, if real, is in the big turns, not the
  week-to-week dates.
- The big hits: Feb 8, 1919 low (called as accumulation Jan 20 to Feb 14);
  Aug 20, 1919 low (called about Aug 23);
  Dec 21, 1920 low (called "temporary bottom" Dec 19); Aug 24, 1921 low
  (called "bottom in August"); Oct 14, 1922 top (called Oct 8-15); in 1929 the
  Sep 28, Oct 9 and Dec 23 lows and the Oct 18 and Nov 8 highs; Mar 9 and
  Sep 22, 1932 tops.
- **Selection caution.** These are the forecasts Gann chose to reprint. Years
  he did not reprint are not in the sample (and the 1932 calls come from his
  own 1954 quotation of that forecast, which may omit misses), so p = 0.006 is an upper bound on
  the evidence, not a clean test. The 1929 calls also sit in the densest
  stretch of swings in the record; the base rate accounts for density, not for
  selection.
- **The "permanent cycle" change dates** printed in the 1929 forecast (Feb 8-10,
  Mar 21-23, May 3-7, Jun 20-24, Aug 3-8, Sep 21-24, Nov 8-11, Dec 20-24) do
  not beat chance in any year span: 1913-1928, 6 of 125 on 9-point swings
  against 8.1 expected; 1929-1949 (after issue), 35 of 163 against 31.3
  (p = 0.24); 3-day, 79 of 164 against 71.7 (p = 0.14).

### Gann's own scoring notes against his own table

| His note | His date | His 1949 table | Off |
|---|---|---|---|
| 1919 bottom (W036 p.3) | Feb 10 | Feb 8, 79.15 | 2 days |
| 1920 low (p.6) | Dec 22 | Dec 21, 66.75 | 1 day |
| 1921 "exact high … May 3" (p.10) | May 3 | May 5, 80.03 | 2 days |
| 1922 extreme high (pp.16-17) | Oct 14 | Oct 14, 103.43 | 0 |
| 1929 "September 3 … top" (W005 p.11, written after the fact about Curve No. 1) | Sep 3 | Sep 3, 386.10 | 0 |

His notes are close but sometimes generous ("exact" was two days off). The
1929 Sep 3 claim refers to a curve image the readings could not see; the
forecast's own text calls tops in May, June and August and no higher after
July, so it is not scored as a forecast here.

## 4. The macro cycle against 130 years of the monthly market

Outcome: Shiller's monthly S&P composite since 1871 (`marketHistory.json`).
A major turn is the high (low) of the 25 months centred on it. A window hits
when a turn of its kind lands within two months of its anniversary month.
In sample: windows before 1936 (the anchors come from a chapter that walks the
market to 1935). Out of sample: 1936 to Jul 2025 (the last month a turn can
still be confirmed).

| Span | Windows | Hits | Expected by chance | p |
|---|---|---|---|---|
| In sample, 1897-1935 | 40 | 10 (25%) | 4.8 (12%) | 0.017 |
| **Out of sample, 1936-2025** | **142** | **13 (9.2%)** | **14.4 (10.1%)** | **0.69** |
| In sample, 4+ lengths | 2 | 0 | 0.24 | 1 |
| **Out of sample, 4+ lengths** | **19** | **1** | **1.9** | **0.87** |

The cycle fits the years its anchors were chosen from and does not carry
forward. Of the 19 strongest out-of-sample windows (the kind 2027 and 2029
are), one hit (Sep 1959, against a Jul 1959 top). Its 60-year counterparts of
2027 and 2029 (Nov 1967, Sep 1969, Sep 1989) all missed. Dewey's checklist:
out-of-sample persistence fails; significance fails out of sample.

## 5. What this means for the platform

- **The 2027-2029 window has a measured record, and the record is no better
  than chance out of sample.** Under "Only the real" it should not be shown to
  members as a forecast. `TIME_LINE_RECORDS.macroCycle` stays `null`, so
  `displayableUpcomingMajor` keeps the dated windows off every member surface.
  Whether to show them labelled "measured: no better than chance" instead is
  the owner's call (asked 2026-10-30).
- Gann's published calls on the important swings are the one result here that
  beats chance, with the selection caution above. Their method ("time factor",
  "Master Time Factor") is not disclosed in any book in the collection
  (`docs/agents/11-every-gann-method-acts.md`, undisclosed methods), so there
  is nothing to build from it; the record is evidence about Gann, not a GSPS
  forecast.
- Nothing in this file may appear on a member surface. A member-facing record,
  if the owner wants one, would describe "a long-cycle calendar projection"
  and its measured result, never the source.

## 6. Can the methods GSPS has built rebuild his calls? (2026-10-30)

Owner: "if his forecasts are correct then they can be reproduced for now."
`lib/research/forecastRebuild.ts`, run
`docs/replay-runs/2026-10-30-forecast-rebuild.json`
(`node scripts/forecast-rebuild.mjs --out <file>`). At each issue date, each
built time method projects its days for the forecast year from the 9-point
swings known on that date, and nothing later. The days are scored against the
52 calls and against that year's 9-point turns. The chance baseline shifts the
same days round the year by every offset, keeping their number and spacing.
The rules are fixed in the module header.

| Method (module) | Calls met / 52 | by chance | p | Turns met / 122 | by chance | p |
|---|---|---|---|---|---|---|
| Wheel day counts (`timeCycles.ts`) | 23 | 26.0 | 0.86 | 68 | 65.0 | 0.30 |
| Day-count bands (Rule 8) | 9 | 11.3 | 0.83 | 25 | 32.3 | 0.95 |
| Yearly cycles 1-60 | 28 | 26.6 | 0.38 | 64 | 61.5 | 0.34 |
| 52-week divisions (`squareOf52.ts`) | 26 | 28.8 | 0.85 | 77 | 72.4 | 0.20 |
| Month counts (`angleMonthCounts.ts`) | 13 | 15.8 | 0.89 | 30 | 36.3 | 0.95 |
| Seasonal points (`seasonalCounts.ts`) | 25 | 27.1 | 0.83 | 28 | 30.1 | 0.77 |
| Permanent calendar dates | 17 | 15.1 | 0.31 | 19 | 13.7 | 0.06 |
| Two or more agreeing | 33 | 35.4 | 0.86 | 87 | 87.1 | 0.56 |

The second run anchors on each finished year's top and bottom only. It gives
the same answer: the yearly cycles meet 14 calls against 11.9 (p 0.27), the
month counts 12 against 10.3 (p 0.31), and agreement 12 against 10.0 (p 0.25).
The day counts, bands and 52-week divisions are shorter than a year, so from
a finished year's extremes they never reach the forecast year.

**None of the built methods lands on his dates more often than chance.** The
permanent calendar dates come nearest on the actual turns (p 0.06), but that
is one of 32 tests run here, and the 1929-1949 test above found nothing. So the
methods in his books do not rebuild his forecasts. Whatever gave his
published calls their edge on the big turns is the part he never disclosed,
the "time factor". A current forecast cannot be reproduced from what GSPS
holds, and none is shown.

## 7. Are planetary aspects the missing time factor? (2026-10-30)

The owner shared nine videos that read the author's famous calls through
planetary aspects: the 1908 "greatest discovery" (a grand square with a grand
trine), the Sep 30, 1909 wheat call (two grand squares and a grand trine),
the 1902 first cotton trade (Sun–Mercury conjunction trine Uranus), the 1921
bull run (Jupiter–Saturn conjunction, Venus catching Jupiter), the Oct 1922
top (Sun, Mercury, Venus), the 1923 cotton short (trines with midpoint
conjunctions), the Sep 3, 1929 top, and the July and Sep–Oct 1932 turns
(conjunctions, oppositions, trines, a Grand Cross). The videos could not be
opened from this environment, so the rules were taken from their
descriptions and fixed before any year was scored.

`lib/research/aspectTiming.ts`, run
`docs/replay-runs/2026-10-30-aspect-timing.json`
(`node scripts/aspect-timing.mjs --out <file>`). Bodies: the Sun and Mercury
to Neptune, geocentric (Pluto, found in 1930, and the Moon left out; the
`symbolWide` rule adds both). Aspects: 0, 90, 120 and 180°, each exact day
±2. Null: the same aspect days shifted round each year, as in section 6.
Seven rules on three outcome sets: 21 tests, so a result needs p below
0.0024 to count.

| Rule | Days marked | Calls met / 52 | by chance | p | 9-pt turns / 446 | by chance | p | 3-day turns / 1,370 | by chance | p |
|---|---|---|---|---|---|---|---|---|---|---|
| Every pair | 81% | 51 | 49.9 | 0.33 | 365 | 360.6 | 0.30 | 1,116 | 1,117.4 | 0.57 |
| Sun, Mercury, Venus | 13% | 10 | 12.6 | 0.89 | 66 | 55.5 | 0.058 | 195 | 176.5 | 0.034 |
| Mars to Neptune | 21% | 28 | 21.5 | 0.023 | 85 | 95.0 | 0.92 | 269 | 286.6 | 0.93 |
| **Jupiter to Neptune** | 5% | **12** | **4.8** | **0.0007** | 22 | 25.7 | 0.82 | 70 | 71.3 | 0.61 |
| Two outer aspects together | 2.5% | 4 | 3.3 | 0.43 | 9 | 10.7 | 0.78 | 44 | 34.5 | 0.030 |
| Grand cross + grand trine | 0% | 0 | 0 | 1 | 0 | 0 | 1 | 0 | 0 | 1 |
| The same with Moon and Pluto | 2% | 1 | 1.9 | 0.91 | 8 | 10.2 | 0.83 | 29 | 28.7 | 0.51 |

Reading it:

- **The author's published dates sit on slow-planet aspects** (Jupiter,
  Saturn, Uranus, Neptune) two and a half times as often as chance, the one
  result that clears the correction. Examples: Saturn opposite Uranus on Jan
  26 and Aug 14, 1919, Jupiter conjunct Neptune on Mar 8 and Apr 25, 1920,
  Jupiter opposite Uranus on May 4, 1921, each within two days of a call. So the videos'
  premise, that he set dates on planetary aspects, has support in his own
  forecasts.
- **But those aspects do not time the market.** Across 1913-1948 the same
  slow aspects meet the Dow's important turns no more often than chance (22
  against 25.7), and no rule does after the correction. Of the 12 calls that
  sit on a slow aspect, 2 caught a turn (1919's Feb accumulation low and
  1932's Sep 20 top), against 10 of his other 40. His edge on the big turns
  came from calls that were not on these aspects.
- **The figures the videos name are not there by the usual definitions.** At
  an 8° orb, a grand cross and a grand trine on the same day happen on 2 days
  in 1900-1949 among the eight bodies (94 with the Moon and Pluto), and on
  neither 8 Aug 1908 nor 30 Sep 1909, with or without the Moon and Pluto.
  On 8 Aug 1908 the sky holds a Sun–Mars–Jupiter conjunction in Leo and
  Uranus opposite Neptune; on 30 Sep 1909, Mars opposite Jupiter and the Moon
  on Saturn. The videos' figures must use other points (midpoints,
  heliocentric places, wider orbs or a drawn chart), which this test does not
  search for.
- **Sep 3, 1929** has no exact aspect within two days (the nearest are Sep
  7-8). *Tunnel Thru the Air* does not forecast the 1929 top: its story runs
  a bull campaign into 1929 (W022 p.239) and has no 1929 crash. The Sep 3
  date is in the author's later account of his Nov 1928 forecast (W001 p.4,
  W005 appendix p.11), scored in section 3.
- **The 1923 cotton short and the 1902 and 1909 trades** are single trades
  with no daily cotton or wheat series here, so they are illustrations, not
  tests. The 1923 account's short began Nov 30, 1923, beside Mercury square
  Uranus (Nov 29) and Mars conjunct Saturn (Dec 1); with every pair counted,
  81% of days sit within two days of some aspect, so a nearby aspect is
  expected on any date.

So aspects look like part of how he set his dates, but not the part that
made the dates right. Nothing here is built or shown to members.

## 8. The public event calendar sold as Gann time indicators (2026-10-30)

The owner found a paid charting indicator that claims "Gann's Laws of
Vibration and Bayer's Rules" and marks New and Full Moons, the Moon's
apogee and perigee and declination extremes, ingresses, retrogrades,
Mercury's speed, declination extremes and latitude. Those event kinds are
public astronomy, so each was tested on the same record with the same null
(`lib/research/celestialEvents.ts`, run
`docs/replay-runs/2026-10-30-celestial-events.json`). The indicator was not
bought or read. Bayer's numbered rules are not built: no Bayer book is in the
collection.

Moon events ±1 day, the rest ±2. 24 tests here, 45 with section 7's, so a
result needs p below 0.0011.

| Event kind | Days marked | Calls met / 52 | by chance | p | 9-pt turns / 446 | by chance | p | 3-day turns / 1,370 | by chance | p |
|---|---|---|---|---|---|---|---|---|---|---|
| New and Full Moons | 20% | 27 | 29.7 | 0.85 | 89 | 90.5 | 0.60 | 288 | 278.5 | 0.24 |
| Moon's perigee and apogee | 22% | 34 | 31.4 | 0.25 | 112 | 96.9 | 0.033 | 299 | 297.7 | 0.48 |
| Moon's declination extremes | 22% | 28 | 31.4 | 0.90 | 102 | 98.0 | 0.32 | 316 | 300.9 | 0.12 |
| Ingresses (Sun to Neptune) | 53% | 47 | 43.2 | 0.094 | 251 | 238.0 | 0.11 | 735 | 726.8 | 0.31 |
| Stations (retrograde, direct) | 20% | 18 | 20.5 | 0.85 | 79 | 91.1 | 0.95 | 267 | 276.1 | 0.78 |
| Mercury at its fastest | 4.5% | 6 | 6.2 | 0.63 | 25 | 21.2 | 0.22 | 67 | 63.1 | 0.30 |
| Declination extremes (Sun to Neptune) | 28% | 27 | 26.3 | 0.47 | 124 | 123.6 | 0.50 | 376 | 379.9 | 0.63 |
| Crossing the ecliptic (latitude 0) | 17% | 20 | 18.3 | 0.33 | 87 | 76.4 | 0.073 | 235 | 231.6 | 0.40 |

None of the eight event kinds times the Dow's turns or his calls beyond
chance; the nearest (the Moon's perigee and apogee on the 9-point turns, p
0.033) is far from the batch's 0.0011. Across all 45 tests the one result
that clears it is still section 7's: his published dates sit on slow-planet
aspects (p 0.0007), without those aspects timing the turns.

## 9. The same rules on today's market: SPY and DIA, 2016-2025 (2026-10-30)

The owner asked whether these hold on recent markets. `lib/research/modernTiming.ts`
runs all 15 rules of sections 7 and 8 on SPY's and DIA's turns from Alpaca
daily bars (split-adjusted, SIP, from 2016, the feed's start;
`lib/research/modernTurns.json`, built by `scripts/build-modern-turns.mjs`):
the 3-Day Chart's turns (165 on SPY, 174 on DIA) and major turns, each the
extreme of 21 sessions either side (67 each). Years 2016-2025, the whole years
held; 2026 is a part year and left out. Run
`docs/replay-runs/2026-10-30-modern-timing.json`. 60 tests, cut-off 0.00083.

Nothing clears it. The lowest p is the planets crossing the ecliptic on DIA's
3-day turns (43 against 29.5, p 0.002), which the same rule does not repeat on
SPY (p 0.061) or on the Dow 1913-1948 (p 0.073 on the 9-point turns, 0.40 on the 3-day). The slow-planet aspects that
his published dates sat on meet 2 to 4 turns a set against 2.4 to 5.8 by
chance. New and Full Moons, ingresses and stations, the two indicators' core
events, sit between p 0.08 and 0.93.

**What GSPS uses today** (read from `lib/gann/timeWindow.ts`, 2026-10-30): the
ephemeris is computed (astronomy-engine), not a printed table, so any year,
2025 to 2027 included, is available. The time-window hold already reads
Jensen's slow-planet aspects, Mars's half-return, the Sun's seasonal points
(its 15° steps, so the Sun's ingresses), the New Moon, the lunar return, the
natural angle and the eclipse crossings, through one rule: a window counts
only when the market turns on it at a price division. Planets' ingresses
other than the Sun's, retrograde and direct stations, the Full Moon, the
Moon's perigee, apogee and declination, Mercury's speed, declination extremes
and latitude are not used, and on this record none of them earns a place.
No dated window is shown to members (the owner's "Keep it hidden",
2026-10-30).

## 10. Hora and Choghadiya, and the planetary file (2026-10-30)

Every planetary method tested, with its result, is now listed in
`docs/PLANETARY_TIMING.md`. The Vedic planetary hours (Hora) and day periods
(Choghadiya), tested against when SPY and DIA print their daily high and low
from 2016 to 2025 (`lib/research/horaTiming.ts`), show nothing once the
weekday is held (p 0.26 to 0.85); an apparent effect under a first null was a
weekday pattern. Details there.

## 11. The time counts in the owner's eight further videos (2026-10-30)

Six counts from the videos (the square root of a pivot's price as days, a
144-day count, Fibonacci session counts, the one-year anniversary, the Gann
emblem and time extension), tested on his calls, the Dow's turns 1913-1948 and
SPY's and DIA's 2016-2025: none beats chance (best p 0.016, cut-off 0.0012
for 42 tests). `lib/research/videoTimeRules.ts`; details in
`docs/PLANETARY_TIMING.md`.
