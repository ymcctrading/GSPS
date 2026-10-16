/**
 * Dated forecast records, kept so a forecast can be scored after the fact
 * (A-OTHER-13; the conditional coffee forecast, A-ASTRO-08, is `forecastLog.ts`). Research only: nothing on the verdict path
 * imports this module (guarded in `lib/validation/__tests__/criteria-gate.test.ts`),
 * and nothing here is shown as a forward claim (AGENTS.md "Forward-looking
 * claims": a projection needs its method and a measured record first; this
 * module is where that record is kept).
 *
 * Sources:
 * - A-OTHER-13 (class A, *Annual Forecasts 1919-1922*, W036 pp. 16-17, 23):
 *   "a supplement will be mailed you each month" when the market strays from
 *   the forecast; a September 1922 supplement moved the bottom from September
 *   15 to September 30, and the forecast's "90 per cent correct" counts the
 *   corrected version. So a record keeps the original windows and each dated
 *   revision apart, and is scored on either.
 *
 * Engineering choices, labelled as such:
 * - A revision may change only windows that have not started by its date;
 *   one that would change a window already under way is refused as hindsight.
 *
 * Three-question basis:
 * 1. Source: as above, class A.
 * 2. Cycles: Dewey's rule that a dated claim is scored against what came,
 *    with the rule fixed before (the record is immutable once issued; a
 *    revision is a new, dated entry). Halberg's and Tomes' point that a
 *    forecast's record decides its worth (CYC-47) is what this keeps.
 * 3. Hermetic: Cause and Effect: a forecast is a stated cause, and only the
 *    dated effect, scored after it, says whether the cause was real.
 */
import { computeMacroCycle } from "@/lib/gann/macroCycle";

const DAY = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface ForecastWindow {
  label: string;
  /** Inclusive dates, YYYY-MM-DD. */
  from: string;
  to: string;
  expect: "high" | "low" | "turn";
}

export interface ForecastRevision {
  date: string;
  reason: string;
  /** The full window list in force from `date`. */
  windows: ForecastWindow[];
}

export interface ForecastRecord {
  id: string;
  issued: string;
  source: string;
  /** The windows as first issued. Never changed. */
  windows: readonly ForecastWindow[];
  revisions: readonly ForecastRevision[];
}

export function issueForecast(r: { id: string; issued: string; source: string; windows: ForecastWindow[] }): ForecastRecord {
  return Object.freeze({ ...r, windows: Object.freeze([...r.windows]), revisions: Object.freeze([]) as readonly ForecastRevision[] });
}

/** The windows in force on a date: the original until the first revision, then each revision in turn. */
export function windowsInForce(r: ForecastRecord, at: string): readonly ForecastWindow[] {
  let w = r.windows;
  for (const rev of r.revisions) if (rev.date <= at) w = rev.windows;
  return w;
}

/** A new record with the revision appended; the original windows stay as issued. */
export function reviseForecast(r: ForecastRecord, rev: ForecastRevision): ForecastRecord {
  const last = r.revisions[r.revisions.length - 1]?.date ?? r.issued;
  if (rev.date < last) throw new Error(`Revision ${rev.date} predates ${last}`);
  const before = windowsInForce(r, rev.date);
  const key = (w: ForecastWindow) => `${w.label}|${w.from}|${w.to}|${w.expect}`;
  const kept = new Set(rev.windows.map(key));
  const changed = [...before.filter((w) => !kept.has(key(w))), ...rev.windows.filter((w) => !before.some((b) => key(b) === key(w)))];
  const started = changed.find((w) => w.from <= rev.date);
  if (started) throw new Error(`Window ${started.label} (${started.from}) is already under way on ${rev.date}`);
  return Object.freeze({ ...r, revisions: Object.freeze([...r.revisions, { ...rev, windows: [...rev.windows] }]) });
}

export interface ForecastScore {
  windows: number;
  hits: number;
  hitRate: number;
}

/** Hits of the original or the final revised windows against dated turns. */
export function scoreForecast(r: ForecastRecord, turns: { date: string; kind: "high" | "low" }[], version: "original" | "revised"): ForecastScore {
  const ws = version === "original" ? r.windows : (r.revisions[r.revisions.length - 1]?.windows ?? r.windows);
  const hits = ws.filter((w) => turns.some((t) => t.date >= w.from && t.date <= w.to && (w.expect === "turn" || w.expect === t.kind))).length;
  return { windows: ws.length, hits, hitRate: ws.length > 0 ? hits / ws.length : 0 };
}

/** The macro cycle's upcoming major windows (`macroCycle.ts`), issued as a record on a date. */
export function macroForecastRecord(asOf: Date): ForecastRecord {
  const windows = computeMacroCycle(asOf).upcomingMajor.map((w) => {
    const [y, m] = w.month.split("-").map(Number);
    return {
      label: `${w.anchor} +${w.yearsElapsed}y`,
      from: iso(Date.UTC(y, m - 1, 1)),
      to: iso(Date.UTC(y, m, 1) - DAY),
      expect: (w.bullish ? "low" : "high") as ForecastWindow["expect"],
    };
  });
  return issueForecast({ id: `macro-${iso(asOf.getTime())}`, issued: iso(asOf.getTime()), source: "macroCycle.ts (Master Course Ch. 7 anchors)", windows });
}
