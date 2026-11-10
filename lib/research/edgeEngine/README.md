# Price-time square engine (research only)

A reproducible, labelled form of an owner-requested study: does a trend change come when a
time count completes at the same moment price reaches a level, and can that be traded? It is
**not** part of the scan, the score, a plan, an order or anything a member sees. Rule ids
are neutral; the source ledger and the results live in the owner-private research folder.

| File | Section | What it does |
|---|---|---|
| `config.ts` | all | families, weights, toggles, thresholds; the defaults the study froze |
| `swing.ts` | 1 | the swing chart (reuses `lib/gann/swingChart.ts`), when each pivot became known, trend, double/triple bottoms, old tops as support, run statistics |
| `sky.ts` | 2, 3 | daily longitudes (astronomy-engine), crossings, ingresses, stations, aspects, eclipses |
| `time.ts` | 2 | time candidates from every family, each with its label, the bar it became knowable and the bar it expires |
| `price.ts` | 3 | levels from every family, each with its label; sloped levels for angles and median lines |
| `pts.ts` | 4 | per-symbol preparation (bitmasks per bar), the detector, grades, direction hints, "time has room / time is up" |
| `trade.ts` | 5, 6 | triggers E1, E2, E3, E6 and the management rules |
| `backtest.ts` | 7 | the book, matched random entries, buy-and-hold, the creation cells, per-family hit rates |
| `reproduce.ts` | 8 | the reproduction checklist (MATCH / CLOSE / NO MATCH / NOT RUN) |
| `edgeCalendar.ts` | 7 | the forward calendar: ranked windows and active levels |

Run the study (daily CSVs `date,o,h,l,c,v`, one file per symbol):

```
node scripts/edge-engine-study.mjs fit  --data DIR --out OUT [--symbols FILE]
node scripts/edge-engine-study.mjs test --data DIR --out OUT --variant OUT/chosen-variant.json [--from D --to D]
```

No look-ahead: a time window counts on a bar only if its pivot was known at that bar's close; a
level counts only if it was built from earlier bars; every fill is at a price the bar traded at
or after the signal (`__tests__/edgeEngine.test.ts` checks the masks and events do not change
when later bars are added).
