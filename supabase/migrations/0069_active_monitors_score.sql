-- Scan history's "now" column (app/api/scan-history/route.ts) could only
-- ever show active_monitors' verdict, never a numeric score -- there was no
-- score column to read. That made "rank these by how executable they are
-- right now" impossible from live data alone, and it's why the scan-history
-- UI showed a bare verdict pill for "now" while the original-scan side
-- showed a numeric score circle: not a rendering inconsistency, a genuine
-- data-model gap. See AGENTS.md's cross-platform consistency principle --
-- the scorecard concept exists on the write side (scan_results.score) and
-- needs to exist here too.
--
-- Nullable: intraday-sourced monitors (app/api/intraday-scan/route.ts) are
-- evaluated off the separate Signal & Regime Engine, not the 9-point
-- Gann/STRAT scorecard, so they have no comparable score to store.
alter table public.active_monitors
  add column score int check (score is null or score between 0 and 9);
