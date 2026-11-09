/**
 * The checks behind scripts/after-pause-recovery.mjs, kept pure so the tests
 * can prove them: the band a refilled day's row count is compared with, the
 * verdict on a dry-run day, on the usage meter and on the next live scan.
 * The runbook that uses them: /mnt/project-files/owner/after-the-pause-runbook.md.
 *
 * Three-question basis: no trading rule is involved (an operations check), so
 * Gann's method and the cycle literature do not apply; the shape is a return
 * of the daily cycle (the evening scan comes back on its own slot), which the
 * next-scan check confirms against the clock, not a stored counter.
 */

export type Level = "PASS" | "WARN" | "WAIT" | "FAIL";
export interface Verdict {
  level: Level;
  message: string;
}

/** The last live day the scheduled scans wrote before the pause (SQL, 2026-11-09 08:55 UTC: 39 rows). */
export const LAST_LIVE_DAY = "2026-10-30";

/**
 * The band a refilled day's row count should sit in: half the smallest to twice
 * the largest of the last `days` live days. Live counts ran 18 to 51 over the 15
 * days before the pause; a refill on the fixed large-cap list runs lower.
 */
export function liveBand(scanDates: string[], days = 15): { low: number; high: number; days: number } | null {
  const counts = new Map<string, number>();
  for (const d of scanDates) counts.set(d, (counts.get(d) ?? 0) + 1);
  const recent = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, days).map(([, n]) => n);
  if (!recent.length) return null;
  return { low: Math.floor(Math.min(...recent) / 2), high: Math.max(...recent) * 2, days: recent.length };
}

export interface DryRunFile {
  summary: { bullish: number; bearish: number; universeSize: number; splitDropped?: string[]; timeTravel: { droppedBars: number } & Partial<AccessSummary> };
  rows: { scan_date: string; symbol?: string }[];
}

/** One dry-run day: no rows or a row filed under another date fails; a count outside the band warns. */
export function judgeDryRunDay(day: string, file: DryRunFile | null, band: { low: number; high: number; days: number } | null): Verdict {
  if (!file) return { level: "WAIT", message: `${day}: no dry-run file (skipped because rows exist, or failed: see the backfill's line)` };
  const rows = file.rows?.length ?? 0;
  const s = file.summary;
  const split = s.splitDropped?.length ? `, left out after a split: ${s.splitDropped.join(" ")}` : "";
  const note = `${rows} rows (${s.bullish} bullish, ${s.bearish} bearish), ${s.timeTravel.droppedBars} bars past the clock dropped, universe ${s.universeSize}${split}`;
  if (rows === 0) return { level: "FAIL", message: `${day}: no rows` };
  if (file.rows.some((r) => r.scan_date !== day)) return { level: "FAIL", message: `${day}: a row is filed under another date` };
  if (band && (rows < band.low || rows > band.high)) {
    return { level: "WARN", message: `${day}: ${note}; outside ${band.low}-${band.high}, the band from the last ${band.days} live days` };
  }
  return { level: "PASS", message: `${day}: ${note}` };
}

/** Has the meter recorded since `since`? Both a fresh reading and at least one usage event are needed. */
export function judgeMeter(
  readings: { meter: string; read_at: string; hold: boolean }[],
  events: { meter: string; occurred_at: string }[],
  since: string,
): Verdict[] {
  const sinceMs = Date.parse(since);
  const latest = readings.map((r) => r.read_at).filter(Boolean).sort().at(-1) ?? null;
  const fresh = events.filter((e) => Date.parse(e.occurred_at) >= sinceMs);
  const perMeter = new Map<string, number>();
  for (const e of fresh) perMeter.set(e.meter, (perMeter.get(e.meter) ?? 0) + 1);
  const out: Verdict[] = [
    {
      level: latest && Date.parse(latest) >= sinceMs ? "PASS" : "WAIT",
      message: `meter last read ${latest ?? "never"} (the hourly check runs at 7 minutes past each hour)`,
    },
    {
      level: perMeter.size ? "PASS" : "WAIT",
      message: `usage events since ${since}: ${perMeter.size ? [...perMeter].map(([m, n]) => `${m} ${n}`).join(", ") : "none yet"}`,
    },
  ];
  const held = readings.filter((r) => r.hold).map((r) => r.meter);
  if (held.length) out.push({ level: "WARN", message: `held at 99%: ${held.join(", ")}; scheduled jobs on those meters stay stopped` });
  return out;
}

/**
 * Did the live evening scan write `day`'s rows on time? Rows carrying
 * `backfilledAt` are the refill's, not the live scan's. On time is from 5
 * minutes before to 90 minutes after the slot (before the pause the scan wrote
 * about 35 minutes after 7 PM ET).
 */
export function judgeNextScan(
  day: string,
  slot: Date,
  now: Date,
  rows: { updated_at: string; detail?: { backfilledAt?: string } | null }[],
): Verdict {
  if (slot.getTime() > now.getTime()) return { level: "WAIT", message: `${day}'s scan is not due yet; run this step after 8:30 PM ET` };
  const live = rows.filter((r) => !r.detail?.backfilledAt);
  if (!live.length) {
    const backfilled = rows.length;
    if (now.getTime() - slot.getTime() < 90 * 60_000) {
      return { level: "WAIT", message: `${day}: no live rows yet; the scan has until 8:30 PM ET` };
    }
    return {
      level: "FAIL",
      message: `no live rows for ${day}${backfilled ? ` (${backfilled} refilled rows only)` : ""}: the evening scan did not run. See "sql" for the schedule check`,
    };
  }
  const stamp = live.map((r) => r.updated_at).sort()[0];
  const lateMin = Math.round((Date.parse(stamp) - slot.getTime()) / 60_000);
  const msg = `${live.length} live rows, written ${stamp}, ${lateMin} minutes after 7 PM ET`;
  return { level: lateMin < -5 || lateMin > 90 ? "WARN" : "PASS", message: msg };
}

export interface AccessSummary {
  dbReads: string[];
  refusedReads: string[];
  refusedWrites: string[];
  refusedHosts: string[];
}

/**
 * What the scan touched across every dry-run day: the database tables it read
 * and the reads, writes and hosts it was refused. The person reviewing the dry
 * run reads this before the write (review of #618: the database reads were
 * never shown before writing).
 */
export function summarizeAccess(files: (DryRunFile | null)[]): AccessSummary {
  const union = (key: keyof AccessSummary) =>
    [...new Set(files.flatMap((f) => f?.summary.timeTravel?.[key] ?? []))].sort();
  return { dbReads: union("dbReads"), refusedReads: union("refusedReads"), refusedWrites: union("refusedWrites"), refusedHosts: union("refusedHosts") };
}

/** A reviewed dry run must be this recent to back a write. Engineering choice: one day. */
export const REVIEWED_DRY_RUN_MAX_AGE_MS = 24 * 3_600_000;

/**
 * Can a write go ahead on an earlier, separate dry run? Every trading day in
 * the range needs either rows already in the table (the backfill skips it) or a
 * dry-run file written within the last 24 hours that passes `judgeDryRunDay`.
 */
export function judgeReviewedDryRun(
  days: string[],
  files: Map<string, { file: DryRunFile | null; writtenAt: number }>,
  daysWithRows: Set<string>,
  now: number,
  band: { low: number; high: number; days: number } | null,
): { good: boolean; verdicts: Verdict[] } {
  const verdicts: Verdict[] = [];
  for (const d of days) {
    if (daysWithRows.has(d)) {
      verdicts.push({ level: "PASS", message: `${d}: already has rows; the write skips it` });
      continue;
    }
    const entry = files.get(d);
    if (!entry?.file) {
      verdicts.push({ level: "FAIL", message: `${d}: no reviewed dry-run file; run dry-run first` });
      continue;
    }
    const ageH = (now - entry.writtenAt) / 3_600_000;
    if (now - entry.writtenAt > REVIEWED_DRY_RUN_MAX_AGE_MS) {
      verdicts.push({ level: "FAIL", message: `${d}: the dry run is ${ageH.toFixed(1)} hours old; run dry-run again` });
      continue;
    }
    const v = judgeDryRunDay(d, entry.file, band);
    verdicts.push(v.level === "WAIT" ? { level: "FAIL", message: v.message } : v);
  }
  return { good: verdicts.every((v) => v.level !== "FAIL"), verdicts };
}

/**
 * Is the site up, and is it running the expected build? `/api/health` reports
 * `commit` from the build's own environment (Vercel's VERCEL_GIT_COMMIT_SHA);
 * the Oct 30 build predates the field, so an answer without it is the old
 * build. A 402 is the hosting pause. `expectSha` may be a prefix.
 */
export function judgeDeploy(status: number, text: string, expectSha: string | null): Verdict[] {
  if (status === 402) return [{ level: "FAIL", message: `402 ${text.split("\n")[0]}: the hosting pause is still on` }];
  let body: { status?: string; feedMode?: string; provider?: string; timestamp?: string; commit?: string | null } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (status !== 200 || body?.status !== "ok") return [{ level: "FAIL", message: `HTTP ${status}: ${text.slice(0, 120)}` }];
  const out: Verdict[] = [
    { level: "PASS", message: `HTTP 200, status ok, market data ${body.feedMode} (${body.provider}), server time ${body.timestamp}` },
  ];
  const commit = typeof body.commit === "string" && body.commit ? body.commit : null;
  if (!commit) {
    out.push({ level: "WAIT", message: "the site reports no build commit: the Oct 30 build is still serving; the latest code goes live with the first push to main after the lift" });
  } else if (!expectSha) {
    out.push({ level: "WARN", message: `the site runs ${commit.slice(0, 7)}; no expected commit was given to compare` });
  } else if (commit.startsWith(expectSha) || expectSha.startsWith(commit)) {
    out.push({ level: "PASS", message: `the site runs ${commit.slice(0, 7)}, the expected build` });
  } else {
    out.push({ level: "WAIT", message: `the site runs ${commit.slice(0, 7)}, not ${expectSha.slice(0, 7)}: the expected build is not live yet` });
  }
  return out;
}
