# MTF-R0.1 development result: retired (2026-11-04)

Internal research record; nothing here reaches a member. Run 2026-11-04,
about 10:00 to 10:20 AM ET, after the preregistration was committed
(`fd65c52`, `fc6901a`). Summary: `dev-run-2026-11-04.json` here; per-window
lists and the pinned Alpaca snapshot (SHA-256 in its manifest) in
`/mnt/project-files/private-research/mtf-r0-1/`. Rerun with
`node scripts/mtf-r01.mjs evaluate --dir <snapshot> --dow <DJA.csv> --out <file>`;
DIA and SPY were rerun after small non-scoring edits (lint, a display label)
and came out byte-identical.

## Verdict: retired on development evidence

The preregistered conditions, checked against the run:

| Condition | Needed | Measured | Met |
|---|---|---|---|
| DIA resolved windows | 30 or more | 27 | no ("not testable") |
| DIA N2 matched-window null | p < 0.0083 | 5 hits vs 2.05 expected, p 0.052 | no |
| Dow resolved windows | 30 or more | 1,500 | yes |
| Dow N2 matched-window null | p < 0.0083 | 153 hits vs 142.5 expected, p 0.18 | no |
| SPY hits above its null mean | above | 2 vs 2.63 | no |
| Dow N1 calendar-phase null (calendar adds information) | p < 0.05 | p 0.75 (R0.1's rate minus duration-only's: −0.051, shifted calendars −0.049) | no |

Confirmation trades after R0.1 windows against the same confirmation without
timing (0.05% a side): DIA 17 trades, +1.07% vs +0.14%, p 0.12; SPY 22,
−0.33% vs +0.10%, p 0.55; Dow 812, +0.165% vs +0.183%, p 0.42. None beats
the untimed control.

So R0.1 is retired. It is not "the secret" and the failure stays on record.
Its forward ledger continues for the record only (PREREGISTRATION.md).

## What the components showed (descriptive, not a verdict)

| Dow 1897-2026, weekly issues | Windows | Direction hits | Rate | N2 expected | N2 p |
|---|---|---|---|---|---|
| R0.1 (calendar ⊗ duration) | 1,500 | 153 | 10.2% | 142.5 | 0.18 |
| Duration only (14-28 / 42-49 days) | 2,171 | 333 | 15.3% | 279.1 | 0.0005 |
| Calendar only, 20% budget | 0 (abstained 6,369 of 6,756 issues) | | | | |
| Calendar only, no budget | 2,467 | 1,273 | 51.6% | (whole months; not comparable) | |

On DIA (2016-2026) duration-only had 144 windows, 19 hits vs 15.6 expected
(p 0.19).

- **The calendar condition subtracts.** Intersecting the year and starred
  month counts with the duration bands lowered the hit rate from 15.3% to
  10.2% on the Dow, and shifting every major anchor's calendar phase by 1 to
  60 months did no worse (N1 p 0.75). By the owner's creation lens this pair
  is a mixture, not a creation: no third thing appeared.
- **Calendar-only cannot issue under its own budget.** A whole candidate
  month is a third or more of a 91-day horizon, so the 20% rule abstains
  almost always. Without the budget it flags a large share of all months.
- **Duration alone beat its null on the Dow (p 0.0005).** It is one of 27
  R0.1 trials and sits after at least 1,066 earlier timing trials in this
  repo, it was not a preregistered hypothesis, and on DIA it does not hold
  (p 0.19). It is a lead for a new, separately frozen candidate tested
  forward, never a finding. Gann's 2-4 week and 6-7 week durations are the
  part that carried signal, if any did.

## Limits

- All three series had been searched by earlier timing research; nothing
  here is an untouched holdout.
- The Dow is close only (high = low = close for the swing charts), and before
  1914 the file's values are spliced, not printed closes.
- DIA and SPY move together; SPY is not an independent test.
- Major anchors are a reading (campaign extremes of the monthly swing chart);
  a different defensible reading is a different candidate.
