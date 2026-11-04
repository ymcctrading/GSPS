# MTF-R0.1 preregistration (owner-private research)

Internal research record. Nothing here is shown to members, and nothing on the
verdict, scan, plan or order path reads it. Written 2026-11-04, about 10:20 AM
ET, **before any market data was run through the engine**. The commit that
adds this file is the freeze; any later change to a rule below is a new
candidate (R0.2), tested afresh, never an edit of this one.

## What is being tested

R0.1 is a newly declared interaction hypothesis: a long calendar condition
(year and starred month counts from major pivots) marks a period worth
watching, and a campaign duration condition (ordinary 14-28 days, rapid 42-49
days from the last minor pivot) marks the part of it where the campaign may
turn. It is not the original "Master Time Factor", not Rule A of
`lib/research/timeProcedures.ts`, and not a revival of any earlier failed
reconstruction. Engine: `lib/research/mtfCandidate.ts`. Adapter:
`lib/research/mtfAdapter.ts`. Evaluation: `lib/research/mtfEvaluate.ts`. The
package's Python files were not found in the repository or the project files;
the TypeScript follows its written ten steps.

## Fixed choices (source rule or engineering choice)

| Item | Choice | Kind |
|---|---|---|
| Major anchors | Highest monthly high of each completed up campaign and lowest low of each completed down campaign on the monthly swing chart; known when the main trend changes; closed months only | Source (monthly chart for the main trend, A2.1, A05); campaign-extreme reading is an engineering choice |
| Reaction anchor | Last completed 3-Day Chart swing, known on its reversal bar | Source (*45 Years* Ch. VII p. 62) |
| Ordinary or rapid | Leg with the monthly main trend: rapid 42-49 days; against it: ordinary 14-28; no main trend read: no anchor | Bounds from the package's reading of the source; the with/against mapping is an engineering choice |
| Expected type | 3-Day Chart line: up leg = top watch, down leg = bottom watch | Engineering choice (package step 9) |
| Episodes | Anchors within 14 calendar days of each other are one episode | Engineering choice |
| Flag rule, budget | 2+ episodes and both groups; abstain above 20% of the horizon | Engineering choices (package steps 6-7) |
| Horizon | 91 calendar days after the issue session | Engineering choice |
| Issue cadence | After the last session of each week | Engineering choice |
| Dedup | A window (start, end, type) counts once, at its first issue | Engineering choice |
| Outcome | Centred 41-session closing extreme, earliest tie, known 20 sessions later; unresolved stays unresolved | Package |
| Sessions | Past spans: the data's own sessions. Forward: `lib/market/calendar.ts` | Package ("verified exchange calendar") |

## Data (development evidence only)

All of it has been looked at before by earlier timing research, so **nothing
here is an untouched holdout**. The only test that can count as prospective is
the forward ledger.

| Series | Source | Span scored | Note |
|---|---|---|---|
| DIA | Alpaca daily, split-adjusted, SIP, pinned snapshot | weekly issues 2016-07 to the last resolvable | Primary. Used by `timeProcedures.ts` 2016-2025 |
| SPY | Same | Same | Secondary (moves with DIA; not an independent test) |
| Dow (DJIA) | MeasuringWorth daily closes, owner upload, `/mnt/project-files/dow-daily/DJA.csv`, never copied into the repo | weekly issues 1897-01 to 2026 | Close only (high = low = close). Used by the forecast rebuild |

Individual universe stocks are not used, so the quant-validation thread's
2016 to 2020-10 single-stock holdout stays untouched.

## Tests and the family

Primary family, six tests, cut-off **0.05 / 6 = 0.0083**:

1-3. N2 matched-window null (circular label rotation, 2,000 seeded draws,
     seed 20261104), R0.1 direction hits, on DIA, SPY and the Dow.
4-6. Confirmation trades after R0.1 windows against the same confirmation
     without timing (20,000 draws), mean net return per trade, on DIA, SPY and
     the Dow.

Required component check (not in the family, min p 1/111): N1 calendar-phase
null on the Dow, statistic R0.1's direction-hit rate minus the swing-only
arm's. R0.1 claims the calendar adds information; if it does not beat the
shifted calendars at p < 0.05, the interaction is a mixture, not a creation.

Descriptive only (reported, counted as trials, never a verdict): the
swing-only and calendar-only arms and their N2 nulls, the no-budget arms, and
the N3 duration-phase null.

## Development verdict, written before the run

R0.1 **survives development** only if all hold:
- DIA's and the Dow's N2 p are below 0.0083, and SPY's hits exceed its null
  mean;
- the Dow's N1 p is below 0.05;
- each of DIA and the Dow has at least 30 resolved windows (the package's
  safety floor; fewer is "not testable", never "surviving").

Otherwise it is **retired on development evidence**. The failure is kept in
this folder and in `docs/GANN_FORECAST_TRACK_RECORD.md`, and it is never
called "the secret". Surviving development proves nothing on its own: this
data was already searched.

## Forward ledger

Weekly issues for DIA and SPY from the first week after this freeze, appended
to the owner-private ledger in
`/mnt/project-files/private-research/mtf-r0-1/forward-ledger.jsonl` (each line
carries the input hash and the previous line's hash) before the windows open,
never edited. Review once DIA has 30 resolved forward windows (at the
expected rate, more than a year): R0.1 is refuted forward unless DIA's
direction hits beat the N2 null at p < 0.05 and R0.1's rate exceeds the
swing-only arm's over the same issues. A candidate retired on development
keeps its ledger for the record only. 30 windows is a safety floor, not a
power calculation.

## Prior trials

Timing tests already run in this repository, read from
`docs/GANN_FORECAST_TRACK_RECORD.md` on 2026-11-04 (section: tests): macro
cycle 4, built methods 32, aspects 21, event calendar 24, modern timing 60,
the public calculator 20, video counts 42, *Super Timing* 28, combination
sets searched 821, time procedures 14 (Hora's count is not stated there).
At least **1,066** prior timing trials, none of which found a reliable
forecast. R0.1 adds its own in `trials.json`. Any R0.1 result is read against
that history, not alone.
