/**
 * GSPS — how long the notification and transition history is kept
 * (coordinator, 2026-10-29, from the 100-member capacity read: the bell and the
 * monitor transitions grow with every member and fill the free tier's 500 MB in
 * about four months; docs/CAPACITY_100_MEMBERS.md).
 *
 * The prune itself is SQL (`gsps_ops.prune_notification_history()`, migration
 * 0138, pg_cron daily at 08:20 UTC, after the visible-scan rollup), so no
 * request or Vercel function runs it. These constants are the same figures, and
 * `retention.test.ts` holds the migration to them and each window to the
 * longest read of its table, so a new read further back than the window fails
 * there first.
 *
 * What is kept, and why each figure clears its readers (grep, 2026-10-29):
 * - in_app_notifications, 30 days. The bell lists the newest rows; the
 *   intraday bell's once-a-move check, Pro's daily bound, the digest and the
 *   evening recap read 30 hours at most; the transition dedupe reads only rows
 *   whose delivery is still dispatchable (6 hours, `DELIVERY_MAX_AGE_MS`).
 * - notification_deliveries, 90 days. The decision gate reads 30 days.
 * - monitor_transitions, 90 days. The cooldown reads the monitor's last
 *   Execute inside `cooldownMs` (hours). Its deliveries cascade with it and a
 *   bell row's link is set null, so the 90 days match.
 * - notification_log, 90 days. Push dedupe reads 30 hours; the Settings log
 *   lists the newest rows.
 * - intraday_alerts, 90 days. The scan's cooldown and the evening recap read
 *   the day.
 *
 * Not pruned, on purpose: trade records (orders, positions, trade logs, exits;
 * S-07, kept indefinitely), the daily record of what was shown
 * (`visible_scan_daily`) and of every Execute call (`shadow_signals`), the
 * evaluation ledger (its own 400 days), and the system-wide scan logs
 * (`coarse_gate_telemetry`, `intraday_system_alerts`), which grow with the
 * universe, not with members, and are the record calibration reads.
 *
 * The figures are engineering choices sized to their readers, labelled as
 * such; no Gann rule speaks to how long a notice is kept. Mandate: 1. N/A (ops,
 * no market technique). 2. Rhythm, as "Cycles as architecture" reads it: a
 * daily prune by age returns each night and a missed night is caught by the
 * next; no periodicity claim about markets. 3. Cause and Effect: a notice is
 * kept while something can still act on it, the record that outlives it is
 * the trade's. Law of Creation: a pair kept apart, not a creation; the notice
 * and the record are two things and only the record is kept.
 */

export const NOTIFICATION_RETENTION_DAYS = {
  in_app_notifications: 30,
  notification_deliveries: 90,
  monitor_transitions: 90,
  notification_log: 90,
  intraday_alerts: 90,
} as const;

export type RetainedTable = keyof typeof NOTIFICATION_RETENTION_DAYS;
