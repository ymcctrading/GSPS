# Experiments: registry and pre-registered manifests

Internal. The quant-validation program's record of what was tried and what
each test must show before its result is seen.

- `registry.json`: every replay configuration written to a file, the failures
  included, rebuilt by `scripts/experiment-registry.mjs` from
  `docs/replay-runs/` and the project's run folders. It is a lower bound:
  anything tried and never written down is missing. Its trial count feeds the
  Deflated Sharpe in `scripts/quant-validation.mjs`.
- `EXP-NNN-*.md`: one pre-registered test each. A manifest is frozen before
  the data it names is read. Once its holdout has been run, the manifest is
  never edited; a revised idea gets a new number and genuinely new data.

Status words are PASS, FAIL and INCONCLUSIVE. Too little data is
INCONCLUSIVE, never PASS. Empty evidence reads NOT MEASURED, never zero.

Tools:

| Tool | What it does |
|---|---|
| `scripts/backtest-universe.mjs --barCache <dir>` | freezes every fetched series with a SHA-256 manifest; the summary prints the manifest hash |
| `scripts/backtest-universe.mjs --historyFrom --historyTo` | replays a fixed window (for example the 2016 to 2020 holdout) instead of the six years back from today |
| `scripts/quant-validation.mjs` | trade-level R with a time-ordered block bootstrap, tail and cost stress, portfolio equity under risk caps, Sharpe, Deflated Sharpe, and (with frozen bars) the random-entry control and an equal-weight benchmark |
| `scripts/core-control.mjs` | the like-for-like control for a core ledger: random entries through the core's own exits and pyramid, the exits alone against a fixed hold, and the pyramid's share (`lib/backtest/coreControl.ts`, `replayCore`'s measurement-only `entryOverride`) |
| `lib/backtest/portfolio.ts`, `controls.ts`, `selectionBias.ts` | the measurement code those scripts call |
