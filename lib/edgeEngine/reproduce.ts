/**
 * Section 8, the reproduction checklist: computed against stated, marked
 * MATCH / CLOSE / NO MATCH, or NOT RUN with the reason. This is arithmetic
 * and turn-date matching, never evidence of an edge. RESEARCH ONLY.
 */
import { dayNum, isoDay } from "./calendar";
import { quarterSquares, ringSteps, squareDegrees } from "./price";
import { aspectDays, longitudeAt, norm360, sky } from "./sky";
import { squaredCount } from "./time";

export interface CheckRow {
  id: string;
  example: string;
  stated: string;
  computed: string;
  verdict: "MATCH" | "CLOSE" | "NO MATCH" | "NOT RUN";
}

const near = (a: number, b: number, match: number, close: number): CheckRow["verdict"] =>
  Math.abs(a - b) <= match ? "MATCH" : Math.abs(a - b) <= close ? "CLOSE" : "NO MATCH";
const dayVerdict = (a: number, b: number): CheckRow["verdict"] => near(a, b, 3, 7);

/** Days in [from, to] on which a body's geocentric longitude crosses `deg`. */
function crossDays(body: Parameters<typeof longitudeAt>[0], deg: number, from: string, to: string): number[] {
  return sky().crossings(body, deg, dayNum(from), dayNum(to));
}

function closestDay(days: number[], target: number): number | null {
  return days.length ? days.reduce((b, d) => (Math.abs(d - target) < Math.abs(b - target) ? d : b)) : null;
}

export function reproductionChecklist(): CheckRow[] {
  const rows: CheckRow[] = [];
  const noData = (id: string, example: string, stated: string, why: string) => rows.push({ id, example, stated, computed: why, verdict: "NOT RUN" });

  noData("G1", "Union Pacific 168 1/8 'won't touch 169' (1909)", "short to 152 5/8", "no 1909 bar data in this environment; quote only");
  noData("G2", "US Steel 94 7/8 'won't go to 95'; bought 86 1/4", "low 86 1/3", "no 1909 bar data in this environment; quote only");
  noData("G3", "September wheat $1.20 by the close, 30 Sep 1909", "touched 1.20", "no 1909 bar data in this environment; quote only");
  {
    const pct = (264 / 286) * 100;
    rows.push({ id: "G4", example: "286 trades in 25 days, 264 profitable", stated: "92.3%", computed: `${pct.toFixed(1)}% (the 1933-35 rows are a stated table, not recomputable)`, verdict: near(pct, 92.3, 0.05, 0.5) });
  }
  {
    const r1 = Math.sqrt(1158);
    const r2 = Math.sqrt(1179);
    const r3 = Math.sqrt(794);
    rows.push({
      id: "R1",
      example: "range 1158-1179 -> sqrt days; sqrt 794; x1.4 trading conversion",
      stated: "~34 and ~28 days; windows ~10, 16, 21 Jul 2020",
      computed: `sqrt range ${r1.toFixed(2)}-${r2.toFixed(2)}; sqrt 794 = ${r3.toFixed(2)}; x1.4 = ${(r1 * 1.4).toFixed(1)}, ${(r3 * 1.4).toFixed(1)} calendar days. Arithmetic matches; the instrument and pivot dates in the transcript do not resolve (the 2020 index low was in March), so the July windows are not checked`,
      verdict: near(r1, 34, 0.5, 1),
    });
  }
  {
    const ring = ringSteps(5).map((x) => Math.round(x));
    const big = quarterSquares(8150, 4).filter((x) => x >= 8100 && x <= 8290).map((x) => Math.round(x));
    const small = quarterSquares(841, 4).filter((x) => x >= 841 && x <= 872).map((x) => Math.round(x));
    const ok = ring.join() === "28,31,34,37,40,43,46,49" && big.join() === "8100,8145,8190,8236,8281" && small.join() === "841,856,870";
    rows.push({ id: "R2", example: "ring 25->49 in 8; 8150 quarter squares; 841 quarters", stated: "28..49; 8100/8145/8190/8236/8281; 841, 856, 871", computed: `${ring.join(", ")}; ${big.join("/")}; ${small.join(", ")} (870.25 rounds to 870, stated 871)`, verdict: ok ? "MATCH" : "CLOSE" });
  }
  {
    // H1: Mars at 166 degrees.
    const days = crossDays("Mars", 166, "2010-01-01", "2014-01-31");
    const stated = ["2010-07-06", "2011-12-18", "2012-06-04", "2013-11-11"];
    const comp = stated.map((s) => closestDay(days, dayNum(s)));
    const verdicts = stated.map((s, i) => (comp[i] === null ? "NO MATCH" : dayVerdict(comp[i]!, dayNum(s))));
    rows.push({ id: "H1", example: "Mars at 166 deg", stated: stated.join(", "), computed: comp.map((d, i) => `${d === null ? "none" : isoDay(d)} (${verdicts[i]})`).join(", "), verdict: verdicts.every((v) => v === "MATCH") ? "MATCH" : verdicts.every((v) => v !== "NO MATCH") ? "CLOSE" : "NO MATCH" });
  }
  {
    const d229 = closestDay(crossDays("Sun", 229, "2016-10-01", "2016-12-31"), dayNum("2016-11-11"));
    const mars = longitudeAt("Mars", new Date("2016-12-02T21:00:00Z"));
    const d317 = closestDay(crossDays("Sun", 317, "2017-01-01", "2017-03-01"), dayNum("2017-02-05"));
    const v1 = d229 === null ? "NO MATCH" : dayVerdict(d229, dayNum("2016-11-11"));
    const v2 = near(mars, 317, 1, 3);
    const v3 = d317 === null ? "NO MATCH" : dayVerdict(d317, dayNum("2017-02-05"));
    rows.push({ id: "H2", example: "Sun at natal Mars 229; Mars 317 on 2 Dec 2016; Sun at 317", stated: "11 Nov 2016; 317 deg; 5-6 Feb 2017", computed: `${d229 === null ? "none" : isoDay(d229)} (${v1}); Mars ${mars.toFixed(1)} deg (${v2}); ${d317 === null ? "none" : isoDay(d317)} (${v3})`, verdict: [v1, v2, v3].every((v) => v === "MATCH") ? "MATCH" : [v1, v2, v3].every((v) => v !== "NO MATCH") ? "CLOSE" : "NO MATCH" });
  }
  {
    const natalSun = longitudeAt("Sun", new Date("1999-01-04T12:00:00Z"));
    const opp = norm360(natalSun + 180);
    const s2001 = closestDay(crossDays("Sun", opp, "2001-06-01", "2001-08-01"), dayNum("2001-07-02"));
    const s2008 = closestDay(crossDays("Sun", opp, "2008-06-01", "2008-08-01"), dayNum("2008-07-02"));
    const j2001 = crossDays("Jupiter", opp, "2000-06-01", "2002-06-01");
    const j2008 = crossDays("Jupiter", natalSun, "2007-06-01", "2008-12-31");
    const v = [s2001 === null ? "NO MATCH" : dayVerdict(s2001, dayNum("2001-07-02")), s2008 === null ? "NO MATCH" : dayVerdict(s2008, dayNum("2008-07-02"))];
    rows.push({ id: "H3", example: "Euro (natal 1999-01-04): Sun opposite natal Sun; Jupiter opposite 2001, conjunct Feb 2008", stated: "2 Jul 2001, 2 Jul 2008; 2001; Feb 2008", computed: `natal Sun ${natalSun.toFixed(1)}; Sun opposite ${s2001 === null ? "none" : isoDay(s2001)}, ${s2008 === null ? "none" : isoDay(s2008)}; Jupiter opposite ${j2001.map(isoDay).join("/") || "none"}; Jupiter conjunct ${j2008.map(isoDay).join("/") || "none"}`, verdict: v.every((x) => x === "MATCH") ? "MATCH" : v.every((x) => x !== "NO MATCH") ? "CLOSE" : "NO MATCH" });
  }
  {
    const ev = aspectDays("Saturn", "Pluto", [0, 180], dayNum("1925-01-01"), dayNum("2026-12-31"));
    const list = ev.map((e) => `${isoDay(e.day)} ${e.angle === 0 ? "conj" : "opp"}`).join("; ");
    const has1931 = ev.some((e) => isoDay(e.day).startsWith("1931") && e.angle === 180);
    const has2000 = ev.some((e) => /^200[01]/.test(isoDay(e.day)) && e.angle === 180);
    const has2010s = ev.some((e) => /^201[0-7]/.test(isoDay(e.day)));
    rows.push({ id: "H4", example: "Saturn-Pluto opposition -> conjunction regimes", stated: "1931, 2000, 2010-17", computed: `${list}. 1931 opposition ${has1931 ? "yes" : "no"}; 2000-01 opposition ${has2000 ? "yes" : "no"}; any 2010-17 aspect ${has2010s ? "yes" : "no"} (the 2010-17 span is between the 2001 opposition and the 2020 conjunction, a regime, not an exact date)`, verdict: has1931 && has2000 ? "CLOSE" : "NO MATCH" });
  }
  rows.push({ id: "H5", example: "bar-count squares", stated: "13 -> 169 -> 16-17 bars; 9 -> 81 bars", computed: `13 -> ${squaredCount(13).toFixed(1)}; 9 -> ${squaredCount(9)}`, verdict: squaredCount(13) === 16.9 && squaredCount(9) === 81 ? "MATCH" : "NO MATCH" });
  noData("H6", "1948-49 soybeans 4-day counts with marks at 33, 49, 58, 70, 90", "turns", "no 1948-49 soybean bars in this environment");
  {
    const seventh = 365.2422 / 7;
    const mv = 1 / (1 / 87.969 - 1 / 224.701);
    const un = 1 / (1 / 84.0205 - 1 / 164.8);
    const quake = new Date(Date.UTC(1906, 3, 18));
    quake.setUTCMonth(quake.getUTCMonth() + 293);
    const ok = near(seventh, 52, 0.5, 1) === "MATCH" && near(mv, 144, 1, 3) === "MATCH" && near(un, 171, 1, 3) === "MATCH" && quake.toISOString().startsWith("1930-09");
    rows.push({ id: "H7", example: "1/7 year; Mercury-Venus synodic; Uranus-Neptune synodic; 1906 quake + 293 months", stated: "52 days; ~144 days; ~171 years; Sep 1930", computed: `${seventh.toFixed(2)} days; ${mv.toFixed(1)} days; ${un.toFixed(1)} years; ${quake.toISOString().slice(0, 7)}`, verdict: ok ? "MATCH" : "CLOSE" });
  }
  noData("A1", "3-6-9 day clusters on the Indian indices; corrections end at 66-75%", "turns", "the Indian index bars are not part of this study's data; the counts are built (T1) and measured on US stocks instead");
  noData("C1", "low-to-high cycle x 1.5 -> swing low; 1x1 from the Election-day high", "turns", "the instrument and dates are not stated precisely enough to check; the rules are built (T2.expand, P3.angle)");
  {
    const deg = squareDegrees(173.04, 140.62);
    rows.push({ id: "T1", example: "high 173.04, low 140.62 on the square", stated: "~101 deg on the 90 deg angle", computed: `(sqrt 173.04 - sqrt 140.62) x 180 = ${deg.toFixed(1)} deg; minus 360 none; the stated 101 does not follow from this formula`, verdict: near(deg, 101, 5, 15) });
  }
  noData("GS1", "7-10 day rule and trailing on EUR intraday", "trade log", "no EUR intraday bars in this environment; both rules are built (trade.ts)");
  noData("CC", "composite 9/22/39/64-day cycle -> mid-Nov 2013 top", "turn", "the instrument is not stated; the composite is built (T7.cycle)");
  return rows;
}
