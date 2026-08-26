# Model & version registry

The doctrine set (`GSPS Foundational Doctrine`, `GSPS Integrated Execution
Doctrine`, `GSPS Strategic Blueprint`) requires a "model/version registry"
before adaptive scoring or public accuracy claims: versioned rows, training
provenance, an approval step, and a rule that a deployed version is never
mutated in place. That registry already exists — `public.learning_models`
(migration `0005_learning_brain.sql`) — but nothing named it as the
doctrine's registry, which is why `GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` (an
external review that could see file inventory but not every file body)
listed it as unverified. This page is that missing label.

## What the table enforces

```
learning_models
  version int, model_type text, status text
    check (status in ('draft', 'approved', 'live', 'deprecated'))
  training_data_slice, sample_count, training_metrics jsonb
  coefficients jsonb, constraints jsonb
  created_by, change_reason, approved_at, approved_by, deprecated_at
  unique (model_type, version)
```

- **Never mutate a deployed version in place.** `unique (model_type,
  version)` makes a new coefficient set a new row, not an update to the
  live one. There is no code path that writes to a `live` row's
  `coefficients` after the fact — see `lib/backtest/propose-weights.ts`,
  which only ever inserts `draft` rows.
- **Draft changes nothing.** `lib/scoring/active-weights.ts`
  (`getActiveWeightSet`) only ever reads the row where
  `status = 'live'`, ordered by version descending. A `draft` or
  `approved` row is invisible to every live scan until a human promotes
  it — the governance step the doctrine calls "compare versions against
  documented datasets ... before adaptation."
- **Training provenance travels with the row.** `training_data_slice`,
  `sample_count`, and `training_metrics` are populated by the same
  proposal path (`propose-weights.ts`), so a promoted model's dataset and
  metrics are on the row being promoted, not in a separate document that
  can drift from it.
- **`model_type`** is the registry's namespace: `score_adjustment` (the
  live criterion weights — see `SCORE_WEIGHT_MODEL_TYPE` in
  `lib/scoring/active-weights.ts`), `target_envelope`, and
  `entry_confidence` are the three the schema currently allows.
  `learning_coefficients` (same migration) holds the per-timeframe /
  per-asset-class / per-tier adjustment factors a `learning_models` row
  can carry.

## What still needs a human, not a migration

- **Promotion itself.** Nothing in this repo promotes a `draft` row to
  `live` automatically, by design — see `approved_by`/`approved_at` on
  the schema. That approval step has no UI yet; today it is a direct
  `update ... set status = 'live'` run by whoever is authorized, which is
  consistent with "never mutate a deployed version in place" (the
  previous `live` row is separately marked `deprecated`, not overwritten)
  but is not yet a reviewable, audited action in its own right. Building
  that review surface is Strategic Blueprint Phase 2 work
  ("model/version registry, reporting dashboards"), not a gap this pass
  closes.
- **Public accuracy claims** stay gated on this registry's existence, per
  the doctrine's "do not add" list — `docs/REPLAY_RESULTS*.md` already
  publish scoped, versioned replay evidence rather than a general
  accuracy claim, which is the doctrine-safe position.

## Cross-reference

See `docs/DOCTRINE_ALIGNMENT_STATUS.md` for how this fits the rest of the
doctrine-to-implementation mapping.
