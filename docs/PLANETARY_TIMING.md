# Planetary timing: every method tested, and its result

Internal research record, started 2026-10-30 on the owner's word ("its own
file surrounding planetary alignment"). It cites the confidential sources and
must never be shown to a member. Each row is one method as tested, with the
rule fixed before scoring, the outcome it was scored on, and where the code
and the run are. Add a method here when it is tested, with its result, whatever
the result.

How every test here works (unless the row says otherwise): the method marks
dates; the dates are scored against turns, and against the same dates
shifted round each year (or, intraday, the same turn times with the planetary
assignment varied), so the number and spacing of the dates are kept and only
their placement is tested. Hit rate against base rate, per Dewey. With many
tests the cut-off is 0.05 divided by the number run in the batch.

Outcomes used:
- **His calls:** the 52 dated Dow calls in his published forecasts for 1919,
  1920, 1921, 1922, 1929 and 1932 (`lib/research/publishedForecasts.ts`).
- **Dow turns 1913-1948:** his own 9-point and 3-day swing tables (*45 Years in
  Wall Street*), `lib/research/dowSwingRecord.json`.
- **SPY and DIA 2016-2025:** Alpaca daily bars (3-Day Chart turns and major
  turns, `lib/research/modernTurns.json`) and 15-minute bars (the time of each
  session's high and low, `lib/research/intradayTurnTimes.json`).

## Results

| Method | Rule as tested | Best p on turns | Beats chance? | Code and run |
|---|---|---|---|---|
| Aspects, every pair (Sun to Neptune) | 0/90/120/180° exact ±2 days | 0.21 (SPY major) | No; marks 81% of days | `aspectTiming.ts`, `2026-10-30-aspect-timing.json` |
| Aspects among Sun, Mercury, Venus | same | 0.034 (Dow 3-day) | No | same |
| Aspects among Mars to Neptune | same | 0.045 (DIA 3-day) | No | same |
| **Aspects among Jupiter to Neptune** | same | 0.44 (SPY major) | **No on turns; yes on his calls (12 of 52 against 4.8, p 0.0007)** | same |
| Two outer aspects within 2 days | same | 0.030 (Dow 3-day) | No | same |
| Grand cross with grand trine ("symbol") | 8° orb, same day | none occur 1913-2025 | No; absent on 8 Aug 1908 and 30 Sep 1909 | same |
| The same with the Moon and Pluto | 8° orb | 0.48 | No | same |
| New and Full Moons | ±1 day | 0.11 (SPY major) | No | `celestialEvents.ts`, `2026-10-30-celestial-events.json` |
| Moon's perigee and apogee | ±1 day | 0.033 (Dow 9-pt) | No | same |
| Moon's declination extremes | ±1 day | 0.12 (Dow 3-day) | No | same |
| Ingresses (Sun to Neptune) | sign change ±2 days | 0.094 (his calls), 0.11 (Dow 9-pt) | No | same |
| Retrograde and direct stations | ±2 days | 0.079 (DIA 3-day) | No | same |
| Mercury at its fastest | ±2 days | 0.22 | No | same |
| Declination extremes (Sun to Neptune) | ±2 days | 0.095 (SPY 3-day) | No | same |
| Planets crossing the ecliptic | latitude 0, ±2 days | 0.002 (DIA 3-day) | No; 0.061 on SPY, 0.073 on the Dow 9-pt | same |
| Hora (planetary hours) | 12 parts sunrise to sunset, Chaldean order from the weekday's lord, New York | 0.50 | No | `horaTiming.ts`, `2026-10-30-hora-timing.json` |
| Choghadiya (good and bad periods) | 8 parts, Amrit/Shubh/Labh good, Udveg/Kaal/Rog bad | 0.26 | No | same |
| Square root of price as days (video yihAnZ0rFd4) | √ of a pivot's price, rounded, in calendar days, added again while within a year, ±1 day | 0.12 (SPY 3-day) | No | `videoTimeRules.ts`, `2026-10-30-video-time-rules.json` |
| 144-day count (video wgV4N9rp-0A, title only) | 144 and 288 calendar days from a pivot, ±2 days | 0.016 (DIA major) | No; SPY 0.06 to 0.07, the Dow 0.10 or more | same |
| Fibonacci session counts (video woXR0_nhu_g) | 21 to 377 sessions from a pivot, ±2 days | 0.19 (DIA 3-day) | No | same |
| One-year anniversary (video woXR0_nhu_g) | the pivot's date a year on, ±2 days | 0.061 (SPY 3-day) | No; also in the yearly cycles, 0.38 on his calls | same |
| Gann emblem (video pbrP1dnye7c) | 90/120/180/240/270/360° of a year from a pivot, and a year on, ±2 days | 0.18 | No; close to the wheel counts and 52-week divisions, 0.86 and 0.85 on his calls | same |
| Time extension (video pbrP1dnye7c) | a swing's length projected from its end, ±2 days | 0.50 | No; marks under 1% of days | same |
| *Super Timing* figure (Walker) | a trine, plus a third body conjunct one end, or square or opposite one end with balanced orbs; 5° orb, Sun to Pluto | 0.25 (SPY 3-day) | No; marks 50-62% of days | `superTiming.ts`, `2026-10-30-super-timing.json` |
| *Super Timing* figure with the Moon as timer | the figure, and the Moon trine a body and square or opposite a figure body, orbs balanced within 2°; 7° Moon orb | 0.14 (DIA major) | No | same |
| Jupiter's ingress (Walker) | from Jupiter entering a sign to leaving its first degree, ±2 days | 0.011 (SPY 3-day), 0.048 (Dow 3-day) | No | same |
| Jupiter's return to a turn's degree (Walker's "once only cycle") | Jupiter within 0.5° of where it stood on one of the last 12 known turns, 60+ days later | 0.26 | No | same |
| Mars opposite its place at the last pivot, near the year's high or low (Rule C, frozen with a kill criterion) | geocentric Mars at noon on the latest confirmed pivot, every exact opposition next month, month-end close within 2% of the 252-session extreme | none issued on SPY or DIA 2016-2025 | Not testable as written | `timeProcedures.ts`, `2026-10-30-time-procedures.json` |
| **Combinations, chosen then tested** | every pair and triple of 17 rules (the aspects, the event kinds, the time of year, the Square of Nine in days, the wheel counts and the four above), and "at least k of 17"; chosen on the Dow 1913-1930, scored on the Dow 1931-1948 and SPY/DIA 2016-2025 | 0.008 (DIA 3-day) | **No** | `combinationTest.ts`, `2026-10-30-combination-test.json` |

The modern rows (SPY and DIA 2016-2025) are `modernTiming.ts`,
`2026-10-30-modern-timing.json`. Batch sizes and cut-offs: 21 aspect tests and
24 event tests on the old record (45, cut-off 0.0011); 60 on SPY and DIA
(0.00083); 6 for Hora and Choghadiya (0.0083); 42 for the video time counts
(0.0012); 28 for *Super Timing* (4 rules on the calls, the Dow's two turn sets
and SPY/DIA's four, 0.0018); 18 for the combinations (3 picks on 6 unseen
outcome sets, 0.0028).

## What it adds up to

- **The one real finding:** the author's published dates sit on slow-planet
  aspects (Jupiter, Saturn, Uranus, Neptune) far more often than chance. So
  aspects look like part of how he set his dates. Those aspects do not time
  turns, though: not the Dow's in 1913-1948, and not SPY's or DIA's in
  2016-2025. His 12 aspect-dated calls caught 2 turns, against 10 of his
  other 40. Whatever made his calls right on the big turns is not the
  aspects.
- **Hora and Choghadiya:** a first null that varied the weekday's lord showed
  a strong effect (p below 0.001). It was a weekday effect, not a planetary
  one: the hour's ruler at a clock time is fixed by the weekday and the
  season, so any weekday pattern in when the high and low print passes that
  null. With the weekday held (each session takes the turn times of another
  session on the same weekday), nothing remains (p 0.26 to 0.85).
- ***Super Timing* (Myles Wilson Walker, 1999), read in full from the scan.**
  Its formula (p.149): a trine must be present, with a conjunction at one
  end, or linked by a square or an opposition (one planet in both), the
  aspects "balanced" (equal orbs, "balanced by 5*"); the Moon "acts as the
  timer"; Jupiter's ingress triggers a change of trend; and a planet's return
  to the degree of an earlier turn on its retrograde loop marks the next
  ("once only cycle"). Each was fixed as a rule before scoring and checked
  against the book's own dates first (the figure is found on 4 Dec 1926 and
  8 Sep 1927 as the book reads them; its Moon positions for 8 Sep 1927 match
  the ephemeris a day and a half earlier, so its chart times differ). None
  beats chance on any record. The figure marks most days of the year, so it
  cannot pick out a turn; the book's examples are a handful of trades read
  after the fact. Its price methods (the hexagon chart and its "1908"
  targets) are price, not time, and are not tested here. Its "clock"
  sequence (the next planet in line features in the next turn) it gives no
  fixed rule for, so it is not built.
- **Combinations (the owner, 2026-10-30: "a combination of rules that must
  align, coupled with a time of year or square of 9").** 821 combinations;
  219 mark enough days to score. Chosen on the Dow's 9-point turns 1913-1930:
  7 of the 219 reach p below 0.05 there, about what chance alone gives (11),
  and none below 0.01. The three best (stations + latitude + Square of Nine;
  stations + latitude; declination + Square of Nine + wheel) were then scored
  unchanged on the Dow 1931-1948 and SPY/DIA 2016-2025: none holds (best p
  0.008 on DIA's 3-day turns, against 0.0028, and 0.73 on the Dow's 9-point
  turns). They do not meet his calls either (3 of 52 against 5.4 expected).
  The book's own combination (figure with the Moon) ranks 17th of 219 at its
  best (p 0.13). So combining the rules does not reproduce his results, on
  the data here.
- **The paid indicators' event kinds** (New and Full Moons, ingresses,
  retrogrades, Mercury's speed, declination, latitude, apogee and perigee)
  were tested without buying them. None beats chance on any record. Bayer's
  numbered rules are not built: no Bayer book is in the collection.

## What GSPS uses today

Read from `lib/gann/timeWindow.ts` on 2026-10-30. The ephemeris is computed
(astronomy-engine), not a printed table, so any year is available, 2025 to
2027 included. The time-window hold reads Jensen's slow-planet aspects,
Mars's half-return, the Sun's seasonal points (its 15° steps, so the Sun's
ingresses), the New Moon, the lunar return, the natural angle and the eclipse
crossings. A window there counts only when the market turns on it at a price
division, so a date never trades alone. None of the methods above that failed
is added. No dated window is shown to members (the owner's "Keep it hidden",
2026-10-30).

## Sources checked and not testable

- *Tunnel Thru the Air* (W022): its foreword says the book hides a timing
  secret "in veiled language"; its only worked timing arithmetic (pp.370-374,
  Biblical counts from founding dates) picks its bases after the fact, and
  its story has no 1929 crash. Its day-for-a-year count is held research-only
  (`lib/research/dayForYear.ts`).
- The 1902 cotton, 1909 wheat and 1923 cotton trades: single trades with no
  price series here; illustrations only (`docs/GANN_FORECAST_TRACK_RECORD.md`
  §7).
- Videos: nine described in the owner's messages are tested above, and eight
  more sent as links on 2026-10-30 (next section).
- The Hora and Choghadiya article (myzodiaq.in) could not be opened from this
  environment; the standard Panchang rules were used, as stated in
  `horaTiming.ts`.

## The eight further videos (2026-10-30)

All eight are from one channel, and despite the astrology framing none uses a
planet: each teaches a count of days from an important top or bottom. Three
transcripts were read in full; YouTube's bot check refused the other five
after those three, so for them only the title is known (their descriptions
are course advertisements). Each rule was fixed from the video before any
year was scored (`lib/research/videoTimeRules.ts` header), with pivots read
only from before the date being projected. Run:
`node scripts/video-time-rules.mjs --out docs/replay-runs/2026-10-30-video-time-rules.json`.

| Video | Title | Rule tested |
|---|---|---|
| yihAnZ0rFd4 | Gann Square Outs: How to Find Time And Price Balance | square root of price as days |
| wgV4N9rp-0A | Gann's Hidden Gem: The 144 Days Cycle | 144-day count (from the title) |
| woXR0_nhu_g | Gann time squaring to predict DLF's rally | Fibonacci session counts; one-year anniversary |
| pbrP1dnye7c | Gann price time squaring to predict Tata Steel's crash | Gann emblem; time extension |
| U9plPZ1gIcs | Using Time Cycles to Identify Turning Points | not scored: the title gives no rule |
| hk6dvVbcC-I | W.D. Gann Trend Reversal Technique | not scored: the title gives no rule |
| ecnls5o40io | Gann Price Time Square in Bank Nifty | not scored: the title gives no rule |
| -k3jYh6IE6Q | Gann Time Cycle for Intraday Trading | not scored: the title gives no rule |

Result: none of the six rules beats chance on any of the seven outcome sets
(his 52 calls, the Dow's 9-point and 3-day turns, SPY's and DIA's 3-day and
major turns). The best is p 0.016 (the 144-day count on DIA's major turns)
against a cut-off of 0.0012; the same count gives 0.06 to 0.07 on SPY and 0.10
or more on the Dow. One of the 42 tests falls under 0.05, fewer than the two
expected by chance. No rule lands on his calls more than chance (p 0.54 to
0.97).

Two limits on what the test can see. On the Dow of 1913-1948, the square root
of the price is only 7 to 19 days, so its steps mark about half the year and
can do little better than chance even if the idea were right; on SPY (about
a third of days) it still shows nothing. The time extension, read only from
swings confirmed before the year began, reaches into the year rarely (under
1% of days), so it was scored on few dates. Pivots count only once confirmed
(31 days after them), a look-ahead guard added at review; before it, three
tests fell under 0.05 (best 0.030) and none passed the cut-off either.
