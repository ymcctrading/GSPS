# Capacity at 100 concurrent members (Q2 item 7, "Scale safely")

Read 2026-10-29 00:32 UTC from production (24 members) and the usage meter's
figures (`/mnt/project-files/usage-meter/limits.md`, read 2026-10-28 23:15 UTC).
Each figure below is scaled linearly from today's per-member rate, an
estimate, not a measurement at 100.

## Order in which the free limits bind

| Limit | Today | At 100 members | Verdict |
|---|---|---|---|
| Alpaca data, 200 requests a minute (whole platform) | `/api/quote` read the vendor on every poll: 12 a minute per open equity view, 20 per crypto view | about 17 open views spent it all before this change | **Fixed here**: one read per symbol per poll interval per instance (`lib/data/sharedSnapshot.ts`) plus a CDN header (`s-maxage` 5 s equity, 3 s crypto), so cost follows symbols watched, not viewers |
| Resend, 100 emails a day | 11 today | the evening digest alone to 100 opted-in members is 100 | Degrades, never drops a notice (2026-10-29, migration 0139): the digest has its own ceiling of 60 under the alerts' 80 and own trades' 95, goes out in a day-shuffled order so the same members are not always last, and a member whose digest email did not go gets a "Summary" bell row and push. A member's own trade notices go to the bell and push as well as email (`lib/notifications/keyNotice.ts`). Past about 60 digest readers, some read it in the app instead; a paid plan or a weekly digest restores email for all |
| Supabase database, 500 MB | 132 MB | see growth below | Binds in about 4 months without retention |
| Supabase connections, 60 | 15 | pooled through the API; members don't hold connections | Fine |
| Vercel deployments, 100 a day | 35 | not member-driven (two releases a day) | Fine |
| Vercel functions (1M invocations, 4 h CPU a month) | not metered (no API on Hobby) | quote polls are the bulk; the CDN header now answers repeats without an invocation | Unmeasured; read the dashboard |

## Database growth per member

| Table | Rows / member | Size / row | At 100 members |
|---|---|---|---|
| `in_app_notifications` (no retention) | 38 a day (884 for 23 members) | ~440 B (12 MB, 28,484 rows) | ~1.7 MB a day, ~620 MB a year |
| `monitor_transitions` (no retention) | 140 a week (3,362 for 24) | ~460 B (15 MB, 34,369 rows) | ~6.4 MB a week, ~330 MB a year |
| `visible_scan_results` (14-day raw rows, then rollup) | steady | 18 MB for 24 members | ~75 MB steady |

From 132 MB plus ~55 MB more scan rows, the bell and monitor transitions
together add about 2.6 MB a day, so 500 MB is reached in roughly 120 days.

## Recommended next steps

1. Retention for `in_app_notifications` (read rows older than 30 days) and
   `monitor_transitions` (older than 90 days), as a pg_cron job beside
   `gsps-visible-scan-rollup`. Neither is a trade record, so the S-07
   keep-indefinitely rule (orders, positions, trade logs) does not cover them.
   Done 2026-10-29 (#558, `lib/ops/retention.ts`, migration 0138).
2. Email: the digest degrades to the bell and push past 60 members a day
   (done 2026-10-29); decide on Resend's paid tier if members should keep
   reading it by email past that.
3. Read Vercel's function usage on the dashboard once a week while members grow.
