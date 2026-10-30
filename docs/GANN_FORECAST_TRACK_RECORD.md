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
