# Scale audit: database indexes and queries (Q2 item 7)

First pass 2026-10-22, read from production (Supabase `vebhpmmzxixlhujlptue`):
`extensions.pg_stat_statements`, `pg_stat_user_tables`, and the performance
advisor. Migration `0113_scale_indexes_and_rls_initplan.sql` acts on it.
Re-run the queries at the end of this file after each scale change, and
add a dated section below rather than editing this one.

## Baseline, 2026-10-22 (before 0113)

The database is small: the largest table is `monitor_transitions`, with
30,326 rows and 14 MB. No query is slow today. The goal is to stop the
per-scan paths from growing with each member's history.

Busiest application statements, by total time since the statistics were
last reset:

| Statement | Calls | Mean ms | Note |
|---|---:|---:|---|
| insert `monitor_transitions` | 31,130 | 2.02 | scan fan-out, one per monitor evaluation |
| `in_app_notifications` duplicate check (transition_id, profile_id) | 13,121 | 2.76 | no index on transition_id; read through the profile index plus a filter |
| insert `visible_scan_results` | 1,792 | 17.64 | batch insert per scan |
| insert `notification_deliveries` | 13,369 | 1.71 | |
| select `active_monitors` | 42,267 | 0.47 | indexed (profile_id, state) |
| insert `coarse_gate_telemetry` | 117 + 186 | 133.7 / 40.8 | batch insert per market scan |
| insert `daily_scans` | 225 | 58.19 | batch upsert per market scan |
| `notification_deliveries` retry sweep read | 370 seq scans | n/a | no index on status, so every sweep read the whole table |

The platform's own overhead outweighs all of these: `pg_timezone_names`
(299 calls, 435 ms mean, the Supabase dashboard and PostgREST schema
reads) and the per-request `set_config` (357,106 calls, 0.04 ms).

Advisor findings:
- **auth_rls_initplan (WARN, 170 policies).** Every row-level security
  policy called `auth.uid()`, `auth.role()` or `auth.jwt()` per row. 0113
  wraps each call in a sub-select, so it is evaluated once per statement.
  A dry run in a rolled-back transaction rewrote all 170, left none
  unwrapped, and every `alter policy` parsed.
- **unindexed_foreign_keys (INFO, 42).** 0113 indexes the 17 that member
  activity or an account deletion's cascade passes through. The remaining
  25 are on research tables (`pivot`, `trend_state`, `volume_state`,
  `volatility_state`, `digital_root_feature`), admin logs and policy
  tables, where rows are few and nothing deletes the parent. They are left
  alone because each index costs a write on every insert.
- **unused_index (INFO, 45).** None are dropped. The statistics are young
  and most of those tables are written but not yet read by a live feature.
  Revisit once the Q2 features that read them have shipped.
- **multiple_permissive_policies (WARN, 5, all on `scan_runs`).** These
  are left for now. Merging the policies changes who can read the table,
  which is an access decision for its own change.

## Shared rate limit (0114), 2026-10-22

The proxy's limiter counted per serverless instance, so a caller spread over
several instances got several budgets. The owner chose Postgres for the heavy
buckets only (credential, outbound, order, scan; `SHARED_BUCKETS` in
`lib/rate-limit-policy.ts`). Those now count in `rate_limit_hit`. It's called
with the server key and waits at most 300 ms; if the database fails or is
slow, the instance's own count decides. The `api` bucket, which is most
traffic, stays per instance and adds no round trip.

Measured in production after applying 0114, in a rolled-back block:

- 2 allowed then 1 refused at a limit of 2, and allowed again once the
  window passed.
- Execute is refused to anon and authenticated and granted to
  service_role; anon can't read the table.
- 0.087 ms mean inside the database over 200 calls.

The network round trip from Vercel isn't measured yet; the `[rate-limit]`
warning logs any call that fails or passes 300 ms.

## Chart and scan reads, 2026-10-22

- **The bar cache never hit across calls.** Every caller builds its window
  from `Date.now()`, so each request's `start` and `end` differed by the
  millisecond. The 15 s cache in `lib/data/http.ts` could therefore only
  coalesce identical concurrent calls. `lib/data/alpaca.ts` now floors both
  edges to the minute. Chart loads and scans of one symbol and timeframe
  within the cache's 15 s now share one vendor read.
- **`/api/bars` is cacheable by the CDN**
  (`public, s-maxage=15, stale-while-revalidate=60`). It returns the same
  bars to every caller, so a repeat is answered without running the
  function. Errors aren't cached.
- **Not cached:** `/api/scan` and the scan lists. They depend on the
  member's tier and preferences, so a shared cache would leak one member's
  view to another.

## Queries to re-run

```sql
select calls, round(total_exec_time::numeric) total_ms, round(mean_exec_time::numeric,2) mean_ms,
       left(regexp_replace(query,'\s+',' ','g'),160) q
from extensions.pg_stat_statements where query not ilike '%pg_stat%'
order by total_exec_time desc limit 25;

select relname, n_live_tup, seq_scan, idx_scan, pg_size_pretty(pg_total_relation_size(relid))
from pg_stat_user_tables where schemaname='public' order by seq_scan*n_live_tup desc nulls last limit 20;
```
