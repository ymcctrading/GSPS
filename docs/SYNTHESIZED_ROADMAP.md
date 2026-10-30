# GSPS Synthesized Roadmap

**Status:** Governing plan from 2026-10-21 (owner: "the roadmaps, as well as
paritys, WD Gann files, observation of cycles, William Hauck book and multi
dimensional documents/creation equation, should coagulate together and create
a synthesized roadmap. that we shall follow moving forward").
**Last updated:** 2026-10-29 (Q2 item 7: shared quotes and the capacity read; status re-read against production 2026-10-28, see Part 5 and "Q2 status").
**Copy for threads outside the repo:** `/mnt/project-files/roadmap/SYNTHESIZED_ROADMAP.md`.

This document joins six bodies of work that until now lived apart. It decides
what GSPS builds and in what order. It does not replace the documents it draws
on: they keep the detail and the history, and this file points to them.

| Source | What it contributes | Where it lives |
|---|---|---|
| The product roadmap | Phases Q1 to Q4, the business goals, metrics and decision gates | `ROADMAP.md` (history and per-initiative detail) |
| The parity documents | Every rule Gann disclosed, its status in GSPS and the build order | `docs/memory-bank/GANN_PARITY_ROADMAP.md`; the 342-rule map in `/mnt/project-files/gann-feature-map/` (`gann_features.json`, `review/tally.md`) |
| W. D. Gann's books | The method itself: time, price, trend, entries, stops, exits, risk, the trader | `/mnt/project-files/literature-reading-output/collection-synthesis.md` and `works/W*`; `docs/memory-bank/sources/A*`; `docs/GANN_HISTORICAL_SOURCES.md` |
| Observation of Cycles (Dewey, Halberg, Tomes) | How a cycle or timing claim is proven: Dewey's 18 criteria, significance tests, out-of-sample persistence | `docs/memory-bank/sources/C01`–`C07`; master report Part I |
| Hauck, *The Emerald Tablet* | The design lens: two-way correspondence, the seven operations as a returning cycle, the union of opposites into a third | `docs/memory-bank/sources/H01_hauck_emerald_tablet.md` (read 2026-09-27; Chs. 1 and 3 are absent from the source PDF itself) |
| The Multi-Dimensional Creation Equation | The fourth design question: is a join a creation (1 ⊗ 1 = 3) or a mixture (1 + 1 = 2)? | `docs/memory-bank/LAW_OF_CREATION.md`; project instructions; `AGENTS.md` |

## Order of authority

When two sources disagree, this order settles it:

1. **Gann's own text** decides the method: any rule, threshold, entry, exit,
   stop, size, time or price reading that a Gann method answers. Decide from
   his text, cite it, build it, and tell the owner what was decided. Hold for
   the owner only what no Gann method answers (security, access, billing, ops,
   legal, copy with no Gann content, figures Gann never gave).
2. **The owner's recorded decisions** in `AGENTS.md`.
3. **This roadmap** decides what is built and when.
4. **`ROADMAP.md`** holds each phase's detail and history.
5. **`BACKLOG.md`** is an idea pool, not a commitment.

---

## Part 1. The synthesis: two tracks that make a third

Every source above lands on one of two tracks.

- **Track M, the method.** Carry Gann's disclosed method one for one, on every
  surface it applies to, and measure each translation. Sources: Gann's books,
  the parity documents, the cycle literature (the proof standard).
- **Track P, the product.** Get the method to traders who pay for it and stay.
  Sources: the product roadmap's phases, metrics and gates.

Read through the Creation Equation, the two tracks are a complementary pair.
On their own they are a mixture. A faithful method no one can reach earns
nothing, and a polished product built on an unproven method makes claims it
cannot keep. They truly interact only where each changes how the other is
read. The product's live outcomes (paper trades, the forward test, the
replay) test the method's translation. The method's measured record decides
what the product may claim and show. The third thing that pair creates is
**a platform whose edge is measured and visible to the trader**. Neither track
contains that alone.

Hauck's reading of the Emerald Tablet gives the shape of the cycle that
creates it, and it agrees with Gann's "what has been will be":

| Operation (Hauck) | What it means for the build | Where GSPS does it |
|---|---|---|
| Calcination | Burn off what isn't Gann | The Gann-grounding audits; non-Gann inputs removed from the verdict |
| Dissolution | Break the market's history into its parts | Swing charts, levels, time counts |
| Separation, "at the proper moment" | Keep the layers apart; time the decision | Context vs. scoring vs. gating; Gann's time rules |
| Conjunction | Join complementary pairs into a third | Price ⊗ time squared, level ⊗ close (the crossing), the nine pillars |
| Fermentation | New evidence after an apparent failure | Replays that lose are read as translation defects first |
| Distillation, repeated | Purify by repetition, never one pass | Replay, diagnose, fix, replay again on a new `STRATEGY_VERSION` |
| Coagulation | Fix the result as a stable release | Versioned releases; only measured claims shown to users |

Hauck's eighth step returns to the first: a release starts the next round.
The cycle is a returning wheel, not a pipeline that stops ("Cycles as
architecture", `AGENTS.md`). Hauck's two-way correspondence adds the point the
platform most needs: work begins in the Below. Evidence from a single trade or
an intraday bar must be allowed to revise the method's translation above it,
which is exactly what the measurement gate does.

## Part 2. Standing rules every phase follows

These are restated from `AGENTS.md` and the project instructions so that a
session reading only this file still follows them.

1. **Gann first, and Gann answers.** Ask "what would Gann do" and do that. Do
   not hold a question for the owner that his text settles.
2. **Everywhere it applies.** A rule, filter or check built for one surface is
   built on every surface it fits: daily scan, intraday scan, dashboard,
   notifications and alerts, scanner, ticker page, order ticket, Guided Mode,
   the portfolio manager, the replay and the backtest. List the surfaces
   before calling a change done.
3. **Gann-derived and measured.** Every scored or acting rule cites a source
   and has outcome evidence. An inverted measurement is presumed a translation
   defect on our side first.
4. **The score stays out of 9**, earned by Gann's own selection criteria (the
   nine pillars, `lib/scoring/pillars.ts`). One pillar may need several checks.
5. **Cycle claims meet Dewey's standard** before they are claimed: a base
   rate, a significance test with a multiple-comparisons correction,
   out-of-sample persistence, the rule fixed before the test.
6. **The four design questions**, answered while the idea forms: Gann's source
   and tier; what the cycle literature says; which Hermetic principle fits;
   and what the join creates (Law of Creation). They are lenses, never
   evidence. They cannot move a threshold, weight, gate or verdict.
7. **No market-cap ceiling.** The only cap rule is the $10B floor
   (`lib/universe/marketCap.ts`).
8. **Speed is a product requirement.** New work fits inside the scan budget or
   runs off the user's path, and its cost is measured.
9. **Merging is deploying.** Only `main` builds, and a merge goes live. Verify
   with the repo's checks first.
10. **No performance claims.** A forward-looking date is shown only with its
    source, method and measured record linked.
11. **Replays run after 20:15 UTC or before 13:00 UTC on weekdays**, so they
    don't rate-limit the live scans on the shared Alpaca key.

## Part 3. Where GSPS stands (2026-10-21)

**Track M.**
- **295 of 342** rules in the Gann feature map pass a fresh review
  (`review/tally.md`). Of the other 47, 43 are declined or blocked by recorded
  owner decisions or missing data, and the rest are in review or fix. The
  2026-10-22 recheck of all 342 (`review/2026-10-22-recheck.md`) reads 203
  faithful, 110 approximated (each labelled), 28 correctly not built, 1 absent
  (A-TIME-19) and 0 contradicted; 34 are missing from a surface they apply to.
  The Gann-rules thread owns these counts.
- The parity matrix (`GANN_PARITY_ROADMAP.md`) has every buildable row built.
  The shared time-window mechanism the astro and Jensen time readings act
  through was built 2026-10-16 (`lib/gann/timeWindow.ts`), and Gann's other
  time counts act through it since 2026-10-27 (53d36fba, `countWindows.ts`).
  Open there: the dated-forecast teaching example (`macroCycle.ts` is on main;
  a dated claim shown to a person still needs its documented record), and the
  Square of 67, which no source in the
  collection holds. (The Square of 52 is Master Course Ch. 14 and is built;
  Ch. 15A gives the Square of 90's days.) The 42 open feature-map rules are
  sorted in the doc "Filling the open Gann rules" (2026-10-21): 10 fillable
  from Gann's text, 11 with a labelled reconstruction, 15 not Gann's, 6
  missing.
- **Named in the books, method under re-check (Chuck, 2026-10-21):** the
  Master Time Factor, the Master Three-Dimension Chart, mass pressure and name
  numerology. Each is being traced back to every page that touches it and to
  sourced reconstructions before anything is called undisclosed. The COE
  average and MOF formula are not on this list: they are built
  (`lib/gann/planetaryAverages.ts`).
- **Measured record:** the cutoffs go back to the protocol's 7/4 (Chuck,
  2026-10-21). 6/3.5 was a 2026-09-14 stopgap, confirmed only on a 2026-09-23
  run that predates the live-trigger fix; the 2026-10-20 score-band run found
  no band above 4 that separates (`docs/replay-runs/2026-10-20-766sym-score-bands-NOTES.md`). The six-year one-hour run lost in every cell. The
  intraday profile failed its pre-registered test (Part 5.2), and the whole
  loss sat in initial stops (`/mnt/project-files/replay-diagnosis/`). The
  edge across regimes is **unproven**, and the platform says so.

**Track P.**
- Built: notifications (email, quiet hours, history), portfolio analytics,
  conditional orders, onboarding tour and glossary, the mobile layout,
  indicators, Guided Mode, the risk engine, live Alpaca execution (now on
  paper for the proving period), three-path promotion, GSPS School, Strategy
  Modes (explain-only), custom scripts, scan history, saved setups, price
  alerts, the autonomous portfolio manager on paper.
- Email works (read 2026-10-28 00:50 UTC, `notification_deliveries`, last 7
  days): 272 sent, 0 failed, 12,442 skipped because member email is opt-in
  (#451). The scheduled jobs run on Supabase pg_cron (#381, staggered in
  PR #403). Billing is inert (no Stripe prices), so there are no paying users
  yet (0 of 20 members, same read).
- Security: the senior code review's P0 and P1 code findings are fixed and
  its migrations applied (`/mnt/project-files/senior-code-review/`). The repo
  is still public (S-03, owner; GitHub reads `visibility: public` on
  2026-10-28).

## Part 4. Phase plan

The calendar comes from `AGENTS.md`: Q1 Aug–Oct 2026, Q2 Nov 2026–Jan 2027,
Q3 Feb–Apr 2027, Q4 May–Jul 2027. Each phase has a product goal (Track P), a
method goal (Track M) and the created third it aims at.

### Q1 — Monetization and retention foundation (Aug–Oct 2026, now)

- **Track P:** alerts reach users on every channel that costs nothing; the
  paid tier is ready to switch on; the decision gate can be read from data.
- **Track M:** the method's parity work and the cutoff re-derivation (owned by
  the Gann-rules thread).
- **The third:** a trader who gets an alert, opens a setup card whose score
  counts Gann's own conditions, and can see what the platform has and has not
  proven.
- **Exit test:** every Q1 item in Part 5 that costs nothing is done, and the
  edge is measured on the current version. There is no budget (owner,
  2026-10-21): paid items (Part 6) stay parked, not counted as pending. The
  owner's plan is to fund them from trading GSPS's own signals once Gann is
  carried 1 for 1 and the edge is proven, with progress recorded daily, and
  from customers his stories bring in.

### Q2 — Differentiation and scale (Nov 2026–Jan 2027)

The product roadmap's Q2 items, re-read against what is already built and
against Gann:

1. **Prove the edge** (the roadmap's "Backtesting engine"). The replay is
   built and matches production's code. What remains: re-derive the cutoffs
   on the current version; walk-forward windows; Monte Carlo resampling of the
   trade list; stress windows (gaps, selloffs, volatility spikes); regime
   splits. Read every loss as a translation question first. This gates every
   public accuracy claim in later phases.
2. **Markets beyond US equities.** One instrument spec (Gann point, session,
   contract size, risk) and one target rule for every instrument
   (`/mnt/project-files/trade-style/DESIGN.md`, owned by the trade-style
   thread). Crypto first, since its data and broker exist. Forex and futures
   need a bars feed and a broker.
3. **Advanced orders.** Built 2026-10-22. Gann's trailing stops already ran
   in the exit managers. Broker-side OCO is answered by Gann: under Q14 there
   is no fixed target, so the live entry carries one stop and nothing pairs
   with it; the bracket rule's profit tranches already rest as OCO orders
   (`lib/trade/exit-manager.ts`). Automated pyramid adds now run on paper
   (`lib/automation/pyramid-adds.ts`, migration 0111): the portfolio manager
   adds Gann's 100/50/30/20/10 lots to the lines it opened and merges each add
   into the line's one exit row, as the replay walks one position. Live adds
   wait for the end of the proving period and a live broker.
4. **Risk dashboard.** Built 2026-10-21 (the Risk card on the Portfolio page,
   `lib/risk/dashboard.ts`, `/api/risk/dashboard`): Gann's capital rules (30
   points a share, a tenth at risk, five stocks), open risk to each stop the
   exit manager holds now, the loss-series pause, the profit ceiling and the
   drawdown, read by the same functions placement uses. Paper accounts; a
   live account's book is the broker's, and the circuit breaker, which is the
   live account's, is not shown.
5. **Performance replay UI.** Built 2026-10-22: the Scanner's "Past scans"
   tab (`lib/scanner/pastScans.ts`, `/api/past-scans`) puts two sessions'
   published Buy and Sell lists side by side, marks what changed and which
   Watch became an Execute later, shows the forward test's walk of each
   Execute, and lists the forward test by strategy version beside the
   committed production-faithful replay (`lib/backtest/replayReference.ts`).
   Reach back is the tier's `scanHistoryRetentionDays`. No bars are fetched.
   The forward test's own faults found while building it (filled trades
   walked by the evaluator before R-032, signals recorded after the close,
   duplicates, a session with none recorded) were fixed on 2026-10-22
   (5146f823, 1df98030, fb4b035e). Read 2026-10-28 00:50 UTC: one row per
   plan a session within a strategy version; a plan re-found after a version
   change is recorded again under the new version, by design, since the
   forward test is read by version. Of the 139 calls for sessions from
   2026-10-14, 98 expired without filling, 4 filled and closed (1 win), 6
   filled and are open, and 31 await their session. That fill rate is the
   Gann-rules thread's to read (it moved Execute to plans placeable today in
   `2026-10-27-execute-ready-now`).
6. **Expanded indicator library.** Built in Q1 out of phase; Q2 adds
   configurable periods and saved presets for the chart overlays (Practice
   account thread). A chart overlay never sets a level; since Chuck's
   2026-10-22 reversal a Strategy Mode that doesn't align with GSPS's plan
   offers its own entry, stop and TP1 (never an MTP), as AGENTS.md's
   "Strategy Modes" records. **Built 2026-10-23**: every chart overlay and
   study takes the member's own periods, and up to 12 named presets keep a
   set of indicators with their periods (`lib/chart/indicatorParams.ts`,
   `/api/settings/chart-indicators`, `settings.prefs.chartIndicators`). A
   technique chosen on the ticket still draws its own lines on its published
   periods, so a preset never moves a Strategy Mode's levels or ranking.
7. **Scale safely.** Database index audit and query baselines; a shared rate
   limit store; caching for chart and scan reads. **First pass built
   2026-10-22** (`docs/SCALE_AUDIT.md`):
   - Migration 0115 adds 20 indexes and has all 170 security policies read
     the user once per query.
   - The heavy rate-limit buckets count once across instances, in Postgres
     (0114, the owner's pick).
   - Chart bars share one vendor read and the CDN caches them.
   - Scan lists stay uncached, since they vary by member.
   - The baselines were re-read on 2026-10-28 (`docs/SCALE_AUDIT.md`): no
     query is slow, and the database is 123 MB. One growth item:
     `visible_scan_results` went from about 1,500 rows a weekday to about
     25,000 after the member fan-out became its own queued job (2026-10-22).
     Nothing in the app reads it, and it added about 4 MB a weekday. Done
     2026-10-28 (migration 0124): it is rolled up nightly into
     `visible_scan_daily`, one row a member, setup and day, and the raw rows
     go after 14 days.
   - Live quotes (2026-10-29): `/api/quote` shares one vendor snapshot per
     symbol per poll interval (`lib/data/sharedSnapshot.ts`) and the CDN
     caches it for that interval; before, about 17 open charts spent the
     data plan's 200 requests a minute.
   - Capacity at 100 members (`docs/CAPACITY_100_MEMBERS.md`): email's 100 a
     day binds first, then the 500 MB database (the bell and monitor
     transitions keep every row), in about four months.
8. **Track M:** the shared time-window mechanism is built (2026-10-16), and
   the astro, Jensen, hexagon, Master Chart and the other time counts act
   through it (the last of them 2026-10-27). Open: the dated-forecast example
   with its documented record, and the remaining review rows (Gann-rules
   thread).

**The third Q2 aims at:** a measured record a trader can read before trusting
an alert.

### Q3 — Mobile and community (Feb–Apr 2027)

As in `ROADMAP.md`: the native app, trade journal and sharing, Interactive
Brokers, sector and breadth scanning (Gann's group rank is built and is the
natural base), dashboard customisation, and the weekly digest. Track M: the
School carries every rule the product shows, in our own words. Gann's
discipline teaching (hope and fear, paper-trade first, the five
qualifications) is the community's standard, not a feature.

### Q4 — Enterprise and scale (May–Jul 2027)

As in `ROADMAP.md`: teams and roles, the compliance audit ledger (the
canonical decision record design is ready), automated trading live once the
proving period has shown the portfolio manager works and a real compliance
review exists, the API, and performance work. Past July 2027 this roadmap is
expired and must be rewritten, not extended.

## Part 5. Q1 status, item by item (re-read 2026-10-22)

Status key: **Done**; **Open** (unpaid, being built); **Owner** (needs Chuck's
budget or his own account); **Other thread** (owned elsewhere, see Part 7).

| # | Q1 item | Status | Evidence or next step |
|---|---|---|---|
| 1 | Email alerts, quiet hours, alert history | **Done** | The domain is verified (gsps.world) and the sender fixed (#419). Member email is opt-in (#451). Read 2026-10-28 00:50 UTC from `notification_deliveries` (by `updated_at`): last 7 days 272 sent, 0 failed, 12,442 skipped (opted out); last 24 hours 12 sent, 0 failed. Before #451 (2026-10-22): 205 sent and 1,639 failed in 24 hours on Resend's daily quota |
| 2 | Browser push notifications | **Done** | `lib/notifications/web-push.ts`, `public/sw.js`, Settings toggle. Migration 0099 is applied, and the three VAPID variables are set in Vercel production (read 2026-10-22). Setup, price and intraday alerts (#416) send push, honoring quiet hours and the score floor, opt-in since #451. 0 browsers subscribed (re-read 2026-10-28) |
| 3 | SMS alerts | Owner | Needs a paid SMS provider (Twilio or similar) |
| 4 | Portfolio analytics | Done | `components/portfolio/analytics-dashboard.tsx` |
| 5 | Conditional orders | Done | `lib/trade/attach-protocol-exit.ts` |
| 6 | Onboarding, glossary, pattern education | Done | Tour, `/welcome`, `/glossary` |
| 7 | Mobile-responsive dashboard | Done | 2026-10-22: 12 signed-in pages and the public ones checked at iPhone 13 (390px) and small Android (320px) in a local browser on the test account; the header overflowed at 320px on every signed-in page and was fixed (`components/app/nav.tsx`). The Dashboard home could not render locally (no service key); its full lists page could. Not yet seen on a real phone |
| 8 | Indicators phase 1 | Done | Chart overlays, explain-only |
| 9 | Paid tier (freemium, subscriptions) | Owner | Code built; Stripe prices must be created in Chuck's Stripe account |
| 10 | Pay-your-way promotion checkout | Owner | Prices approved; same Stripe step |
| 11 | Vercel Pro | Owner (optional) | No longer needed for scheduling: jobs moved to Supabase pg_cron (#381), and Vercel's crons now run only two daily backups. Its one remaining use is the daily deploy cap |
| 12 | Sentry error capture | **Done** | `instrumentation.ts` and `instrumentation-client.ts` read `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, both set in Vercel production (read 2026-10-22) |
| 13 | Caching for scan results and portfolio snapshots | **Built** (PR #404, migration 0101) | `lib/portfolio/paper-equity.ts` marks every paper account each session; promotion reads its high-water drawdown. Found and fixed on the way: paper equity counted a short's value twice, on every surface that read it |
| 14 | Rate-limit hardening | **Done** (PR #404) | `lib/rate-limit-policy.ts`: five budgets by what a request costs; scheduled jobs exempt. The four heavy buckets count once across instances in Postgres since 0114 (Q2 item 7) |
| 15 | E2E tests | **In progress**; Owner (CI) | Part 1, the intraday bell, merged in #406. Part 2, the email and push delivery tests, is with the paper-trading thread. CI still needs a test Supabase project |
| 16 | Novice risk engine reset checklist | **Done** (PR #404) | `/api/risk/reset-checklist`, a Settings card, and the circuit breaker holds new entries until it is completed |
| 17 | Decision-gate metrics (retention, adoption, signal quality) | **Done** (PR #404) | `/api/admin/decision-gate` (operator secret only). Read 2026-10-21: 20 members, 3 active in 30 days, first-cohort retention 1 of 18 (6%), 0 paying, forward test 19 of 30 winners (+0.82R average), alerts 714 of 12,974 sent |
| 18 | Scheduled jobs running on time | Other thread | Moved from GitHub schedules to Supabase pg_cron (#381), with job staggering in PR #403. Scan speed is bounded by Alpaca's free-tier rate limit. Senior-review thread |
| 19 | Restore the 7/4 cutoffs (Chuck, 2026-10-21) and measure them | Restored (PR #414); measurement owed | Gann-rules thread |
| 20 | Intraday alerts on Gann's primitives | **Done** | #402, #416; the Intraday trade style (#439) |
| 21 | Trade plans by style and instrument | **Done** | #405, #411. Fast retired 2026-10-28 (#484): two styles, Swing from the daily plan and Intraday from an intraday alert, and the chart's timeframe picks which plan it draws |

**Q1 outcome (re-read 2026-10-28).** Every unpaid Q1 item is done except two
that need Chuck's accounts: E2E tests in CI (item 15, a test Supabase project)
and the measurement of the 7/4 cutoffs (item 19, the Gann-rules thread's
replays, running). The paid items stay parked (Part 6).

## Q2 status, item by item (re-read 2026-10-28)

| # | Q2 item | Status | Owner or next step |
|---|---|---|---|
| 1 | Prove the edge | Running | Gann-rules thread: six-year daily slices on the current version (GitHub "Universe backtest (manual)"). Walk-forward, stress windows and regime splits are built (2026-10-28, `lib/backtest/robustness.ts`) and run locally on a finished run's `trades.csv` (`npm run backtest:robustness`); since 2026-10-29 the universe runner's summary carries them per cell beside the Monte Carlo (`monteCarlo.ts`), so the next run reports both. Reading them on the current version's run is next |
| 2 | Markets beyond US equities | Crypto built; forex and futures parked | One plan and one instrument spec for every market (#405, #411). Forex and futures need a bars feed and a broker (Part 6) |
| 3 | Advanced orders | **Done** 2026-10-22 | Live pyramid adds wait for the proving period |
| 4 | Risk dashboard | **Done** 2026-10-21 | |
| 5 | Performance replay UI | **Done** 2026-10-22 | Forward-test faults fixed; its fill rate is with the Gann-rules thread |
| 6 | Expanded indicator library | **Done** 2026-10-23 | |
| 7 | Scale safely | **Done** 2026-10-29: first pass, baselines re-read, `visible_scan_results` rolled up (0124), shared quotes, the 100-member capacity read, notification retention built (0138; its prune job was not yet scheduled in production at 04:30 UTC) | Email capacity (#561): past about 60 digest readers a day the rest read it in the bell; Resend's paid tier restores email (Part 6) |
| 8 | Track M | Time-window mechanism done; review rows open | Gann-rules thread |

## Part 6. Waiting on Chuck's budget or accounts

| Item | Kind | What it unlocks |
|---|---|---|
| Paid real-time market data | Paid feed | Equity Execute verdicts without the 15-minute lag hold |
| Vercel Pro (optional) | Paid upgrade | A higher daily deploy cap only; scheduling no longer needs it (pg_cron, #381) |
| Resend paid tier (optional) | Paid upgrade | The evening digest by email for every member past about 60 a day (#561); without it the rest read it in the bell |
| SMS provider (Twilio or similar) | Paid service | Text-message alerts |
| Stripe prices | Chuck's account (Stripe charges per transaction, no fee to set up) | Subscriptions and pay-your-way checkout |
| Test Supabase project for CI | Chuck's account (free tier may suffice) | End-to-end tests in CI |
| Futures and forex bars and a broker | Paid feeds and accounts | Q2's non-equity scanners |
| App Store and Google Play accounts | Paid accounts | Q3's native app |
| SOC 2 and penetration testing | Paid services | Q2 to Q4 security |

## Part 7. Who owns what (parallel threads, 2026-10-22)

| Thread | Owns |
|---|---|
| Gann rules mapped to GSPS | Scoring, the pillars, replays, the cutoffs, the feature map |
| Intraday trading with Gann | Intraday alerts (PR #402) |
| Intraday replay | The intraday replay profile |
| Trade plans by trade style | Swing and fast styles; the instrument types |
| Senior code review | Security, ops, the gsps.world domain, Resend email, pg_cron |
| Synthesized roadmap and Q1 tasks | This roadmap; Q1 item 7 (mobile) |
| Paper trading health and PR reviews | Q1 item 15 part 2 (delivery tests); Q2 item 7 (scale safely) |

Agree file boundaries with the owning thread before touching its area.

## Part 8. Keeping this current

- Update Part 3 and Part 5 in the same PR as the work that changes them, and
  move "Last updated".
- When a phase closes, write its outcome here and open the next phase's
  status table.
- When a new source is read, add its note under `docs/memory-bank/sources/`
  and say here what it changes, if anything.

## Design basis

1. **Gann:** every method item cites his text through the parity documents.
   The roadmap itself is a plan, not a Gann technique.
2. **Cycles:** the roadmap makes one periodicity claim about itself, that the
   build is a returning cycle. That is an engineering property, not a market
   claim. Every market timing claim it schedules goes through Dewey's test.
3. **Hermetic:** Polarity (method and product, novice and expert) and
   Correspondence in both directions (the rule above shapes every surface
   below; evidence below corrects the translation above). Rhythm shapes the
   cycle of Part 1. Mentalism, Vibration and Gender don't describe a plan's
   order.
4. **Law of Creation:** method ⊗ product, creating a platform whose edge is
   measured and visible. The conservation clause holds: joining them adds
   structure, not evidence. Until the replay proves the edge, the platform
   claims none.
