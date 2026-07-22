# GSPS Phase 0 — Improvements Log

**Author:** Claude Code
**Date:** 2026-07-22
**Branch:** `claude/gsps-doc-review-spem8d`

This document lists the changes, fixes, and updates I made to the Phase 0
scaffold after the first pass — the things that make it faster, more robust, and
easier to actually use and deploy. Each item explains the problem in plain
English and what I did about it. All changes keep the paper/simulation posture
(no live money) and are verified: `npm run typecheck`, `npm test` (12 passing),
and `npm run build` all pass.

---

## IMP-1 — Made the scanner dramatically faster

**Problem.** The mock data source built one synthetic price tick for *every
minute* of *every day* over a 120-day window, for every symbol. A single daily
scan of 9 symbols generated roughly 400,000 data points. The test suite took
about **35 seconds**, and each real scan was needlessly slow.

**Fix.** The mock now samples at a resolution that matches the chart timeframe
being requested (hourly points for a daily chart, 1-minute points only for
1-minute charts, etc.), while still feeding the same aggregation pipeline that
proves the candle-bug fix. Prices remain a pure function of absolute time, so
results are still identical run-to-run.

**Result.** The test suite dropped from **~35 s to under 1 s**, and scans return
much faster. Files: `src/lib/marketData/mockProvider.ts`.

---

## IMP-2 — Hardened the API routes

**Problem.** The scan endpoints called into the engine with no error handling, so
an unexpected failure would surface as an ugly unhandled 500. The batch endpoint
also accepted an unlimited list of tickers, meaning a single request could fan
out to an unbounded amount of work.

**Fix.**
- Wrapped `/api/scan` and `/api/batch-scan` in try/catch so failures return a
  clean JSON error with the right status code.
- Capped a custom batch at **50 tickers** and reject empty lists.
- Marked all API routes `dynamic = "force-dynamic"` so they're never
  accidentally cached as static during build.

Files: `src/app/api/scan/route.ts`, `src/app/api/batch-scan/route.ts`.

---

## IMP-3 — Added a health-check endpoint

**Problem.** Nothing told a monitor (or a person) at a glance whether a
deployment was up and which mode it was running in.

**Fix.** New `GET /api/health` returns `status: ok`, the phase, and — importantly
— confirms `marketDataProvider: mock` and `brokerageMode: paper`, so it's
obvious the deployment is in simulation mode. File:
`src/app/api/health/route.ts`.

---

## IMP-4 — Made the dashboard usable on a fresh/serverless deploy

**Problem.** The scanner starts empty until the post-close cron runs. On Vercel's
serverless model the in-memory cache also resets between cold starts. So a
freshly deployed site would show "Analyzing market close data…" essentially
forever, with nothing to look at — a bad first impression.

**Fix.** Added a **"Run scan now"** button (both in the header and the empty
state). It triggers a scan and renders the returned results directly in the
browser, so it works regardless of whether the server-side cache is warm. The
status dot and message reflect the running state while it works.

Files: `src/components/ScannerDashboard.tsx`.

---

## IMP-5 — Wired the post-close scan as a real Vercel Cron job

**Problem.** The scan is supposed to run automatically after market close, but
nothing scheduled it on the hosting platform. Also, Vercel Cron invokes
endpoints with a **GET** request, while the run endpoint only had a POST handler.

**Fix.**
- Added `vercel.json` with a cron entry hitting `/api/scanner/run`.
- Added a **GET** handler to that route (default-universe scan) so Vercel Cron
  can call it, and set `maxDuration = 60` so a full scan has time to finish.

**DST note.** Vercel Cron schedules are in **UTC**. I set `15 21 * * 1-5`
(21:15 UTC, weekdays), which is 16:15 EST / 17:15 EDT — i.e. always *after* the
16:00 ET close year-round. If you want it exactly 15 minutes after close in both
seasons, you'd need a small handler that checks the ET clock, or two seasonal
schedules. Files: `vercel.json`, `src/app/api/scanner/run/route.ts`.

---

## IMP-6 — Pinned the Node version for reproducible builds

**Problem.** Nothing declared which Node version the project targets, so a host
could build on an unexpected runtime.

**Fix.** Added `engines.node >= 20` to `package.json` and a `.nvmrc` (Node 22).
Files: `package.json`, `.nvmrc`.

---

## Deployment

Deployed the built app to Vercel (paper/simulation mode) using the Vercel
integration — no GitHub push required, which is convenient since the Claude
GitHub App is still read-only on the repo. The live URL and deployment details
are recorded in the main review log (`docs/GSPS-Doc-Review-Log.md`, §8).

---

## Not changed (deliberately)

- **Live data / brokerage / payments** — still stubbed behind clean seams;
  unchanged, and intentionally so (needs real accounts + compliance).
- **Charting UI** — still pending your reference screenshots (Q-6).
- **Scanner rule thresholds** — the Strat gate + 9-point checklist are wired with
  reasonable placeholder thresholds; tuning them to your real Gann/Strat strategy
  is a separate, deliberate task once you share the exact rules.
