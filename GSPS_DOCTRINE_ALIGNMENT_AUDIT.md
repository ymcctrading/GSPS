# GSPS Doctrine Alignment Audit

Evidence review of GitHub, Supabase, and Vercel against the GSPS Integrated Execution Doctrine.

Audit date: August 22, 2026.

_Converted from the uploaded PDF of the same name; source of truth for wording is that PDF if this ever drifts. Some findings below may already be stale relative to current `main` — see the session note at the bottom._

## Scope and evidence

This audit reviewed the deployed GSPS stack: GitHub repository `ymcctrading/GSPS`, Vercel project `gsps` linked to that repository, and Supabase project GSPS (ref `vlbsrhxghghfkjbttqha`). The earlier Noodle1981/Front-Api repository is not the deployed GSPS application. Repository source and deployment metadata were reviewed; the live Supabase database could not be enumerated because the project is inactive and table/migration queries timed out. Consequently, database findings distinguish verified repository intent from unverified live-state execution.

## Audit rule

The doctrine requires market uncertainty to become clearer, safer, explainable, testable, and durable. The audit classifies capabilities as: present/aligned; present/misaligned; missing/aligned; and missing features that should remain deferred or be redesigned because their normal implementation would violate the doctrine.

## Executive assessment

**Overall: conditional alignment, blocked by Phase 0 stabilization.** The codebase contains substantial doctrine-aligned work: guided sizing caps, paper workflows, replay/backtest infrastructure, trade lifecycle records, terminology/IP protections, security remediations, CI, preview deployments, and user education. However, the currently connected Supabase project is inactive; runtime evidence shows unresolved schema drift and timeouts in scan/backtest paths; email delivery is not production-ready; and the migration ledger itself has duplicate version 0034. These operational failures prevent claiming a stable, reconstructible decision-and-evidence platform until remediated.

## 1. Present and aligned

| Evidence | Doctrine alignment | Assessment |
|---|---|---|
| Guided Decision Mode: `lib/guided` includes caps, sizing, eligibility, near-miss, configuration, and service modules; recent merges added per-trade dollar caps and stock-size caps. | Calcination / bounded risk; PRD requires user risk, deployed-capital, and per-trade limits before plan or simulated execution. | Aligned. Risk ceilings and eligibility are explicit design elements rather than afterthoughts. |
| Wait/no-trade behavior: near-miss implementation is intentionally separate from recommendations, lacks order/sizing fields and action buttons; commits document Watch-tier negative expectancy and preserve Execute gating. | Dissolution; PRD requires Watch, Conflict/Wait, and Stand Down instead of a score-as-instruction. | Aligned. The system preserves uncertainty and prevents a near miss from entering a buy flow. |
| Learning and evidence: `lib/backtest`, learning, journal, trade, portfolio and scan domains; migrations for trade logging, learning, protocol exits, paper trading, analytics, and critiques. | Fermentation; provenance and signal-to-action-to-outcome lineage. | Substantially aligned. Strong substrate for replay, outcomes, and review. |
| Live/replay consistency effort: shared scoring path was corrected so role-aware structural scoring applies in live scanning and replay; real replay results were committed, including negative Execute-bucket evidence. | Test; PRD requires the same rule path where applicable and honest disclosure of outcomes. | Aligned. The code history demonstrates willingness to record unfavorable results rather than conceal them. |
| IP and public-language controls: brand guide, terminology constants, user-copy tests, banned-terms workflow, and removal of user-facing internal root values. | Separation; keep proprietary calculations private and use neutral Trade Map terminology. | Aligned. This is a concrete protection for IP and understandable user surfaces. |
| Security and change controls: `SECURITY.md`, `.env.example`, security workflow, PR template, branch hygiene, migration security remediations, and documented remediation of exposed RPC/data-disclosure paths. | Coagulation; least privilege, reviewed changes, auditable stabilization. | Aligned, with operational caveats. Repository control plane is mature relative to stage. |
| Deployment discipline: Git-linked Vercel project, preview deployments for branches/PRs, production deployment history with rollback candidates, latest reviewed production build completed in 31 seconds. | Stabilize; controlled release and rollback evidence. | Aligned. Deployment traceability exists. |

## 2. Present but misaligned

| Finding | Why it conflicts | Required response |
|---|---|---|
| Supabase project is INACTIVE. Project ref `vlbsrhxghghfkjbttqha` was returned inactive; live table and migration reads timed out. | Violates Phase 0 requirement for known production status, queryable data environment, migration verification, and an operational runbook. | Critical — stabilize first. Confirm whether this is the live database used by production; restore or re-link deliberately; then verify schema and migrations. |
| Schema drift in runtime. Vercel logged missing `positions.scan_result_id` and `orders.contract_cost` columns while application code attempted writes. | Violates canonical decision/outcome lineage and migration discipline. Failed reconciliation means positions or rejected-order evidence can be incomplete. | Critical. Establish canonical migration ledger, reconcile deployed schema against main, repair only through reviewed migrations, then add schema-contract checks. |
| Duplicate migration version 0034. Source contains both `0034_referrals.sql` and `0034_trade_critiques.sql`. | Violates the doctrine's explicit canonical migration-order and schema-hygiene requirement; creates ambiguous deployment history. | High. Freeze new migrations, document applied state, renumber/replace using a forward-only plan, and test a clean replay. |
| Operational timeouts. `/api/market-scan`, `/api/backtest`, and `/api/learning/propose-weights` timed out at 60 and 300 seconds in the last seven days. | Violates resilience and evidence requirements: a partial or timed-out scan/backtest cannot be treated as a complete, trustworthy decision or learning result. | High. Isolate jobs, queue long work, persist partial state only with explicit completeness markers, set latency SLOs, and fail closed. |
| Notifications are not deliverable end-to-end. Resend returned 403 because the sender domain is unverified. | The roadmap's alert promise cannot be claimed while delivery is blocked; alert history without delivery confirmation is not proof of user notification. | High. Verify domain, implement delivery/bounce state, test quiet hours, and gate paid-alert launch on successful end-to-end evidence. |
| Automation appears ahead of proof. Demo auto-trading is scheduled several times daily; commits describe A/B arms and a future autonomous-manager path. | Automation before a completed model registry, stable data/migration layer, reproducible positive evidence, and formal permissions can outrun user control and evidence. | Medium–High. Keep demonstration-only, label clearly, prohibit live user automation, and require an automation readiness gate. |
| Public repository. The GSPS GitHub repository is publicly visible. | The doctrine requires private proprietary calculation mechanics. Existing terminology gates help but public source may expose architecture/logic beyond intended interfaces. | High strategic risk. Conduct IP exposure review; move sensitive engines/configuration to private repositories or protected server-side services. |

## 3. Missing but aligned

| Missing capability | Doctrine driver | Priority |
|---|---|---|
| Verified canonical decision record. A single versioned contract spanning raw context, structure zones, Trade Map, risk/pivot, execution and outcome could not be confirmed from live schema. | PRD provenance, reconstructibility, separation of raw data/inference/plan/execution/outcome. | P0. Define contract and database persistence; require source, freshness, session, timeframe, model version, risk, pivot and counter-scenario. |
| Model/version registry and rollout ledger. Backtests and code fixes exist, but a formal registry with version ownership, datasets, assumptions, approvals, and rollback status was not verified. | No learning without a trace; never mutate deployed scoring in place. | P0/P1. Build before adaptive scoring or public accuracy claims. |
| Production migration verification and schema-contract CI. Source migrations exist but live checks failed and runtime schema errors prove divergence. | Coagulation / stabilization. | P0. Add a release gate that compares expected migrations/schema before deployment. |
| Queue/cache/job isolation. Runtime timeouts show current synchronous paths are insufficient. | Scale/resilience; historical workloads must not destructively compete with real-time scans. | P1. Separate scan, replay, and learning proposal jobs; centralize provider throttling. |
| Alert delivery observability. Notifications tables/workflows exist, but domain verification and delivery outcomes are incomplete. | Evidence before monetization; trustworthy alerts require delivery trace. | P1. Delivery status, retries, bounces, quiet-hour decisions, and latency measurement. |
| Suitability and permission matrix. Eligibility controls exist, but a formal asset/broker/automation maturity matrix was not verified. | PRD requires constrained equities first and gated leveraged assets/routes. | P1. Explicitly gate asset classes, paper/live modes, broker routes, and automation. |
| Incident and recovery runbook. There is release history and monitoring, but no verified system-wide runbook for outage, stale data, provider failure, or rollback. | Stabilize; operating durability. | P1. Document owners, detection, containment, rollback, recovery and postmortem process. |

## 4. Missing features that would misalign if added conventionally

| Feature / temptation | Why conventional implementation misaligns | Doctrine-safe position |
|---|---|---|
| Public "65%+ accuracy" or performance guarantees. | The observed committed replay evidence includes negative Execute-bucket expectancy and a 26.7% 1-day win rate against a 33.3% 2R break-even threshold. Claims would outrun validated methodology. | Do not add. Publish only versioned, scoped methodology and outcomes after reproducibility and independent review. |
| One-click live automated trading. | Conflicts with user authority, bounded risk, suitability, reconciliation, and evidence controls — especially while database and job stability remain unresolved. | Defer. Paper/staged execution only until explicit permission, cap, reconciliation, incident, and rollback gates pass. |
| Social leaderboards / copy-trading. | Can reward risk-taking and certainty theater rather than user understanding and bounded decision-making. | Defer public ranking/copying. Prefer private journals, critiques, education, and non-promotional outcome review. |
| Expose Gann roots, vectors, formulas, or internal node logic. | Conflicts with IP separation and user simplicity; it also turns explanatory surfaces into reverse-engineering surfaces. | Keep absent from public UI/API/client bundles. Offer plain-language context, levels, risk, pivot, and rationale. |
| Additional asset classes or leveraged products by default. | Expansion without suitability and product-maturity controls makes the system less bounded and harder to explain. | Do not add as unrestricted defaults. Require per-asset eligibility, data quality, execution rules, and evidence gates. |
| Adaptive live weighting from user behavior. | Would make decisions irreproducible unless outcomes, datasets, version control, review, and rollback are mature. | Do not add. Use offline proposals, documented tests, approval, staged rollout, and a model registry. |

## Sequenced remediation plan

- **0–7 days: Stabilize.** Resolve the Supabase active/inactive ambiguity; capture a canonical live schema and applied-migration ledger; repair drift affecting positions/orders; resolve duplicate migration numbering forward-only; verify `CRON_SECRET` and Resend sender-domain configuration; create incident/runbook ownership.
- **1–3 weeks: Re-establish trust contracts.** Implement/verify the canonical decision record, freshness/completeness markers, model-version field, risk/pivot/counter-scenario constraints, and database contract tests. Block actionable flow on missing fields.
- **3–6 weeks: Evidence and delivery.** Split long scan/backtest/learning workloads into jobs; add provider-rate and timeout handling; complete notification delivery observability; validate paper-trade and outcome lineage; create a model/evidence registry.
- **After proof gates: Expand.** Only then consider broader assets, mobile/API work, community, broker expansion, and limited automation — each via the seven-part Creation Gate and explicit maturity/permission criteria.

## Audit limitations

The Supabase connector returned no active security or performance advisor lint findings, but could not enumerate tables or applied migrations because the project is inactive/timed out. This is not evidence of a healthy schema; it is a material audit limitation and itself a Phase 0 finding. GitHub file-content retrieval exposed file inventory and metadata consistently but did not return all requested file bodies, so findings are grounded in repository structure, migration names, CI inventory, commit history, Vercel deployment/runtime telemetry, and the inspected doctrine documents.

## Session note (added when this file was committed to the repo)

Two findings above no longer match current `main` (`df5c45b7119d082ac48f05f13561fc0c72d5526d`) as of this session:

- **Duplicate migration 0034** — resolved. Current `main` has a single `0034_trade_critiques.sql`; the referrals migration is `0035_referrals.sql`. No duplicate exists in the repository's migration sequence today.
- **Supabase project reference** — this audit was run against `vlbsrhxghghfkjbttqha`, which the Handoff document explicitly calls out as *not* the production project. Production is `vebhpmmzxixlhujlptue`. The inactive-project finding and the schema-drift/timeout findings tied to it should be re-verified against the correct production project before being treated as current.

Everything else in this document — the doctrine-alignment findings on notifications, automation, IP exposure, the missing canonical decision record, etc. — has not been independently re-verified in this session and should be treated as the original audit's findings pending that review.
