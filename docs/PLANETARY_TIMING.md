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

The modern rows (SPY and DIA 2016-2025) are `modernTiming.ts`,
`2026-10-30-modern-timing.json`. Batch sizes and cut-offs: 21 aspect tests and
24 event tests on the old record (45, cut-off 0.0011); 60 on SPY and DIA
(0.00083); 6 for Hora and Choghadiya (0.0083).

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
- Videos: nine described in the owner's messages are tested above. Eight more
  (links only) are with the thread "Test the eight new Gann astrology videos",
  which adds its rows here.
- The Hora and Choghadiya article (myzodiaq.in) could not be opened from this
  environment; the standard Panchang rules were used, as stated in
  `horaTiming.ts`.
