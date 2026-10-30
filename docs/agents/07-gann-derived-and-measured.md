## Gann-derived AND measured — standing principle

Every scored criterion must clear two independent gates. Neither substitutes
for the other. Project owner direction, 2026-09-16.

1. **Gann-derived** — traces to a citable source in
   `docs/GANN_HISTORICAL_SOURCES.md`, with the tier recorded.
2. **Measured** — has outcome evidence in
   `lib/validation/criteria-registry.ts`.

**What measurement is FOR.** It verifies that *our translation* of a Gann
rule into code is faithful. A criterion measuring negative or inverted is
presumed a porting defect on our side — wrong anchor, wrong scale, wrong
timeframe — **not** evidence against Gann. `harmonicProximity`'s stale
Square-of-9 anchor is the worked example: the criterion was not wrong, the
anchor was, and measurement is what exposed it. Attribution is a debugging
instrument pointed at our own code. It is never a jury on the methodology.

**Check gate 1 before hunting a translation bug.** That porting-defect
presumption applies to a criterion that *is* Gann-derived. For one that
never was, an inversion is the expected result rather than a bug to chase:
a non-Gann filter measuring against Gann-selected setups is what "it never
belonged" looks like in the data. The `adxTrendStrength` discard (audit
outcome above) is the worked example, and the general rule it yields is
worth stating on its own — **when a criterion measures against its declared
sign, ask whether it was ever grounded in the methodology the setups are
selected by, before spending effort on a translation bug that may not
exist.** Gate 1 first, then gate 2.

**What measurement is NOT.** It does not confer legitimacy on a threshold.
Legitimacy lives in the criteria being counted, which are Gann's. A cutoff
on a count of Gann conditions is a ranking and display decision, not a claim
about the market.

**Gate 1 status** (2026-09-16; updated 2026-09-25 after re-verifying against
`lib/scoring/weights.ts#CRITERION_KEYS`):

- `adxTrendStrength` (Wilder) — **resolved: discarded, and landed.** Removed
  from `CRITERION_KEYS` in PR #236; `TOTAL_POINTS` is back to 9 and the
  cutoffs rescaled with it. See "Audit outcomes" above.
- `patternArmed` (STRAT) — **resolved 2026-09-17: renamed to
  `entryTriggerArmed` and regrounded** on Gann's swing-crossing rule
  (`lib/gann/entryTrigger.ts`). See "Entry pricing moved off STRAT" under
  "Audit outcomes". No gate-1 failure remains among the nine. The same
  taxonomy's non-gating display use is deliberately kept (audit outcome
  above).

Resolving a gate-1 item changes `CRITERION_KEYS.length` — which moves
`TOTAL_POINTS` and both thresholds — so it is deliberately not a drive-by
edit. PR #236 is the worked precedent for doing it properly: criterion out,
registry entry retired, thresholds rescaled to hold the same relative bar,
and the reasoning recorded here.

