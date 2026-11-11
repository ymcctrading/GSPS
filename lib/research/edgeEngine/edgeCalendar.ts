/**
 * The forward "edge calendar" (section 7): for the next `days` calendar days
 * after the last bar, the time windows ranked by score with their rule
 * labels, and the levels active now. Only windows knowable at the last bar
 * are listed. RESEARCH ONLY: a list of counts, not a forecast; nothing here
 * has passed the study's test (see the owner-private result file).
 */
import { TIME_FAMILIES, type EngineConfig, type PriceFamily, type TimeFamily } from "./config";
import { isoDay } from "./calendar";
import { levelAt } from "./price";
import type { Prepared } from "./pts";

export interface CalendarDay {
  date: string;
  score: number;
  families: TimeFamily[];
  rules: string[];
}

export interface EdgeCalendar {
  symbol: string;
  asOf: string;
  windows: CalendarDay[];
  levels: { price: number; family: PriceFamily; rule: string }[];
}

/** Needs a Prepared whose `candidates` and `levelSets` were kept (the study's runner drops them). */
export function edgeCalendar(P: Prepared, cfg: EngineConfig, days = 90): EdgeCalendar {
  const last = P.bars.length - 1;
  const lastDay = P.clock.dayOf(last);
  const out: CalendarDay[] = [];
  for (let k = 1; P.clock.dayOf(last + k) <= lastDay + days; k++) {
    const i = last + k;
    const fam = new Map<TimeFamily, string[]>();
    for (const c of P.candidates) {
      if (c.avail > last || c.expire <= i || Math.abs(c.index - i) > c.tol) continue;
      (fam.get(c.family) ?? fam.set(c.family, []).get(c.family)!).push(c.rule);
    }
    const families = TIME_FAMILIES.filter((f) => fam.has(f));
    const score = families.reduce((s, f) => s + cfg.timeWeights[f], 0);
    out.push({ date: isoDay(P.clock.dayOf(i)), score, families, rules: families.flatMap((f) => fam.get(f)!.slice(0, 2).map((r) => `${f}: ${r}`)) });
  }
  out.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  const set = [...P.levelSets].reverse().find((s) => s.at <= last);
  const close = P.bars[last].c;
  const levels = (set?.levels ?? [])
    .map((L) => ({ price: levelAt(L, last + 1), family: L.family, rule: L.rule }))
    .filter((L) => Math.abs(L.price / close - 1) <= 0.15)
    .sort((a, b) => a.price - b.price);
  return { symbol: P.symbol, asOf: P.dates[last], windows: out, levels };
}
