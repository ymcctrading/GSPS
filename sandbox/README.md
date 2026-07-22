# sandbox/ — SIMULATION ONLY

⚠️ **This directory is not the real application.** It exists solely to run a
full end-to-end *test scan* so the API pipeline, the corrected default asset
list, and the scoring waterfall can be demonstrated.

- `scanEngine.mjs` — a **mock** `scanTicker()` that produces **deterministic
  synthetic** results from a hash of the ticker. It is **not real market data**
  and **not the real Gann/Sniper logic** (that engine is missing — see
  `review/insights/06-missing-scanticker-engine.md`). It also implements
  `selectReversions()`, the top-15 waterfall from
  `review/insights/04-scoring-waterfall-and-payload.md`.
- `run-test-scan.mjs` — runs the scan over the canonical 9-asset default list
  (plus a larger stress list to exercise the top-15 truncation), prints a
  report, and writes `last-scan.json`.

Run it:
```bash
node sandbox/run-test-scan.mjs
```

**When the real `scanTicker` engine arrives, delete this whole directory.**
