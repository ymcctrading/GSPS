# Doctrine alignment status

Maps the five GSPS doctrine documents (Foundational Doctrine, Integrated
Execution Doctrine, Product Requirements Document, Strategic Blueprint,
and the `GSPS_DOCTRINE_ALIGNMENT_AUDIT.md` review of the deployed stack)
against what Phases 0, 1, 3, 4, and 5 (PRs #116, #117, #118, #119/#120,
#121) actually shipped, plus what this pass adds. This is the "durable
asset ledger" the doctrine's governance cadence calls for — update it when
a doctrine-scoped feature lands or a status changes, rather than
re-deriving this from scratch each time.

## Already implemented (verified in code, not duplicated here)

| Doctrine requirement | Where |
|---|---|
| Decision states — Qualified Long/Short, Watch, Conflict/Wait, Stand Down; score is never itself an instruction | `lib/types.ts` (`ScanDecision.outputState`), `lib/guided` near-miss handling (deliberately separate from recommendations) |
| Trade Map contract — outlook, entry zone, targets, risk level, pivot plan, setup strength, timeframe, generated time, plain-language next action | `lib/types.ts` (`TradeLevels`), `lib/constants/gspsTerminology.ts` (approved public labels) |
| Counter-scenario / pivot plan ("what to watch if the outlook fails") | `pivotPlan` terminology + the opposite-direction pivot plan tested in `lib/__tests__/intraday-scanner.test.ts` and `components/scan/intraday-alerts.test.tsx` |
| Reversal-triggered stop adjustment ("if a stock reverses, GSPS recommends the adjustment") | `lib/trade/protocol-rules.ts` / `lib/trade/protocol-exit.ts` — Rule 3's `master_reversal` state; `exit-manager.ts` pushes the recomputed stop to the broker |
| Risk contract — no actionable plan without invalidation/risk level, user risk, deployed-capital, per-trade budget | `lib/guided` caps/sizing/eligibility modules |
| Model & version registry — versioned, draft/approved/live/deprecated, training provenance, never mutated in place | `learning_models` / `learning_coefficients` (migration `0005`), `lib/scoring/active-weights.ts`, `lib/backtest/propose-weights.ts` — see `docs/MODEL_REGISTRY.md` (new, this pass) |
| Replay/backtest evidence, honestly disclosed (including negative-expectancy results) | `lib/backtest/*`, `docs/REPLAY_RESULTS*.md` |
| Live/replay rule-path consistency | Shared scoring path noted in `docs/BACKTESTING.md` |
| IP/terminology separation — proprietary calculations server-side, neutral public labels | `docs/GSPS_BRAND_GUIDE.md`, `lib/constants/gspsTerminology.ts`, `scripts/check-banned-terms.mjs` (CI gate) |
| Suitability / permission matrix by tier | `lib/entitlements/policy.ts` (Phase 3A) |
| Monitor lifecycle — Watch→Execute, cooldown/re-arm, invalidation precedence, idempotent delivery | `lib/entitlements/monitor.ts`, `monitor-store.ts`, `delivery.ts` (Phase 3E) |
| Trusted scheduled jobs, market calendar | `lib/market/calendar.ts`, `lib/entitlements/scheduled-scan.ts` (Phase 3D) |
| Queue/job isolation — historical/scheduled work must not starve real-time scans | `lib/entitlements/scan-fanout.ts`, migration `0040_scheduled_scan_job_idempotency` (Phase 4) |
| Notification delivery idempotency, retry, preview-send suppression | `lib/entitlements/delivery.ts`, migration `0041_phase5_delivery_retry_and_suppression`, `.github/workflows/notification-delivery-retry.yml` (Phase 5) |
| Least-privilege RPC lockdown | Migrations `0038`/`0039` and the earlier `0025`–`0030` series (Phase 0) |
| Migration ledger hygiene (unique numeric prefixes, forward-only) | `scripts/check-migrations.mjs`, gated in `.github/workflows/test.yml`; the duplicate `0034` the audit flagged is already renumbered on `main` |
| Deployment discipline, rollback record | Git-linked Vercel project (`vercel.json`), `docs/DEPLOYMENT_SOP.md` |
| Public "65%+ accuracy" claims avoided | `docs/REPLAY_RESULTS*.md` publish scoped, versioned, dated evidence only |
| Incident runbook with ownership/detection/containment/recovery/postmortem | `docs/RUNBOOK.md` — Incident response section (new, this pass) |

## Still open — and why each is not closed by more code

| Gap | Why it's still open | Owner |
|---|---|---|
| **Resend sender domain unverified** — alerts still send from `onboarding@resend.dev` (`lib/notifications/resend-handler.ts`), not a verified `gsps.app` domain. | DNS/domain verification happens in the Resend dashboard, not in this repo. Code already isolates this behind one call site and fails closed (`docs/RUNBOOK.md` → Rollback / disable) so nothing is silently broken by it. | Human: verify the domain in Resend, then flip the `from` address. |
| **Supabase Auth leaked-password protection disabled** (security advisor `auth_leaked_password_protection`). | An Auth *project setting*, not schema — no migration touches it. | Human: toggle it in Supabase → Authentication → Policies. |
| **Public GitHub repository** — the audit's "High strategic risk" IP-exposure finding. | Repository visibility is an organizational decision with consequences (collaborator access, CI secrets exposure surface, any existing public links) that only the org owner should make, not something to flip silently. | Human decision, out of scope for this PR. |
| **Formal, single versioned "canonical decision record"** spanning Signal Context → Structure Zone → Trade Map → Order/Trade → Learning Record as one explicit contract with a shared record-version field. | The pieces all exist and are individually provenance-tracked (`ScanResult`, `scan_executions`, `positions`/`orders`, `learning_models`), but they are not yet threaded together under one explicit versioned envelope the way the PRD's "Required entities and contracts" table describes. Unifying them is a cross-cutting schema and API change touching the scan pipeline, the entitlement tables, and every consumer of a scan result — a Phase 1/2 blueprint item worth its own design pass and PR, not something to bolt on speculatively here. | Next dedicated PR; scope it against `lib/types.ts` (`ScanResult`) and `scan_executions`/`visible_scan_results` (migration `0036`) as the two halves to reconcile. |
| **Everything on the doctrine's "do not add" list** — one-click live automated trading, social leaderboards/copy-trading, exposing Gann roots/vectors/formulas publicly, unrestricted asset-class expansion, adaptive live weighting from user behavior. | Deliberately excluded by the doctrine itself, not a gap. Automation stays demo/paper-only (`docs/RUNBOOK.md` notes the demo-auto-trade workflow is separate from user-facing automation); scoring changes stay in the draft→approved→live registry path above. | N/A — correctly deferred. |

## Reading this against the roadmap

`AGENTS.md` derives the current roadmap phase from today's date and defers
to `ROADMAP.md`/`BACKLOG.md` for what's scheduled next. The doctrine set's
own phase numbering (0–5, by scope) does not map one-to-one to the
calendar-quarter phases in `ROADMAP.md` (Q1–Q4) — the doctrine's Phase 0–5
is the trust/evidence sequencing this repo's Phase 0/1/3/4/5 PRs already
implemented; `ROADMAP.md`'s Q1–Q4 is the commercial/feature sequencing
built on top of it. The one open item above with real engineering weight
— the unified canonical decision record — belongs in whichever roadmap
phase is current when it's picked up; it is infrastructure the doctrine
requires before further alert/analytics/automation expansion, so treat it
as a dependency for those rather than parallel, optional work.
