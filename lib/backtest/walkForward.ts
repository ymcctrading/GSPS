/**
 * The rule ladder's keep test: does adding a rule to the core improve results
 * on years the decision to add it never saw? (`docs/RULE_LADDER.md`)
 *
 * Anchored walk-forward, one fold per calendar year. For test year Y the
 * decision is made on every campaign before 1 January Y: add the rule when the
 * kept campaigns' mean R there beats the current set's. That decision is then
 * applied to year Y alone. A rule is kept when, pooled over every test year,
 * the campaigns traded out of sample beat the current set's, and a bootstrap
 * over symbols puts that gain above zero with `confidence`. The bootstrap
 * re-runs the whole procedure, decisions included, so decision noise counts
 * against the rule.
 *
 * Unit: one campaign (a position with its adds), R on the whole line, by the
 * ET year of its first entry. Mean R per campaign is the measure because
 * capital is the scarce thing (Gann's five stocks): a filter earns its place
 * by making the trades taken better, not by taking fewer trades. Engineering
 * choices, labelled: the yearly folds, the minimum counts and the 95% level.
 *
 * Offline, a filter drops a refused campaign and leaves the rest as they were.
 * A campaign it refuses could have changed what came after it on that symbol,
 * so the set the ladder keeps is confirmed by one run that gates on it
 * (`ruleMode: "gate"`) before anything is read from it.
 *
 * Cycle lens (Dewey): a rule that helped in the years it was found and not
 * after has failed "persistence after discovery", the out-of-sample test the
 * seven-item checklist leaves out; this is that test, applied to each rule.
 */

export interface LadderRow {
  symbol: string;
  /** ET date "YYYY-MM-DD" of the campaign's first entry. */
  date: string;
  /** R on the whole line. */
  r: number;
  /** Ladder rules that refused this campaign's first entry. */
  refused: ReadonlySet<string>;
}

export interface WalkForwardSpec {
  /** The years tested out of sample, in order. Each is decided on every earlier campaign. */
  testYears: number[];
  /** Fewest campaigns the decision may rest on, either side. */
  minTrainCampaigns: number;
  /** Fewest out-of-sample campaigns the rule must leave, pooled. */
  minTestCampaigns: number;
  /** Bootstrap draws over symbols. */
  resamples: number;
  /** The share of draws whose gain is above zero for the rule to be kept. */
  confidence: number;
  seed: number;
}

export const DEFAULT_WALK_FORWARD: WalkForwardSpec = {
  testYears: [2022, 2023, 2024, 2025, 2026],
  minTrainCampaigns: 100,
  minTestCampaigns: 200,
  resamples: 2000,
  confidence: 0.95,
  seed: 20261029,
};

export interface FoldResult {
  year: number;
  added: boolean;
  trainBase: number | null;
  trainWith: number | null;
  testBaseN: number;
  testChosenN: number;
  testBase: number | null;
  testChosen: number | null;
}

export interface RungResult {
  rule: string;
  kept: boolean;
  /** Plain reason for the verdict. */
  reason: string;
  folds: FoldResult[];
  /** Pooled out-of-sample mean R, the current set and with the rule's decisions. */
  oosBase: number | null;
  oosChosen: number | null;
  oosBaseN: number;
  oosChosenN: number;
  /** oosChosen − oosBase. */
  gain: number | null;
  /** Share of bootstrap draws with a gain above zero. */
  pPositive: number | null;
  /** 90% bootstrap interval of the gain. */
  gainLow: number | null;
  gainHigh: number | null;
}

export interface LadderResult {
  steps: RungResult[];
  /** Reference rules, each tested alone against the core. Never kept. */
  references: RungResult[];
  kept: string[];
  /** The core, and the core with the kept rules, out of sample. */
  coreOos: { n: number; meanR: number | null; totalR: number };
  finalOos: { n: number; meanR: number | null; totalR: number };
}

/** Sums by symbol and year: [n, sum] for the current set and for the set with the rule. */
interface Cell { nBase: number; sBase: number; nWith: number; sWith: number }

const yearOf = (row: LadderRow) => Number(row.date.slice(0, 4));

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const passes = (row: LadderRow, rules: Iterable<string>) => {
  for (const r of rules) if (row.refused.has(r)) return false;
  return true;
};

/** Per symbol, per year: the current set's and the candidate's sums. */
function aggregate(rows: readonly LadderRow[], base: readonly string[], rule: string): { symbols: string[]; cells: Map<number, Cell>[] } {
  const bySymbol = new Map<string, Map<number, Cell>>();
  for (const row of rows) {
    if (!Number.isFinite(row.r) || !passes(row, base)) continue;
    let years = bySymbol.get(row.symbol);
    if (!years) bySymbol.set(row.symbol, (years = new Map()));
    const y = yearOf(row);
    let cell = years.get(y);
    if (!cell) years.set(y, (cell = { nBase: 0, sBase: 0, nWith: 0, sWith: 0 }));
    cell.nBase++;
    cell.sBase += row.r;
    if (!row.refused.has(rule)) {
      cell.nWith++;
      cell.sWith += row.r;
    }
  }
  const symbols = [...bySymbol.keys()].sort();
  return { symbols, cells: symbols.map((s) => bySymbol.get(s)!) };
}

/** The walk-forward on aggregated sums, symbol i weighted `weights[i]` times (1 each for the real run). */
function walk(cells: Map<number, Cell>[], weights: ArrayLike<number>, spec: WalkForwardSpec) {
  const years = new Map<number, Cell>();
  for (let i = 0; i < cells.length; i++) {
    const w = weights[i];
    if (!w) continue;
    for (const [y, c] of cells[i]) {
      let t = years.get(y);
      if (!t) years.set(y, (t = { nBase: 0, sBase: 0, nWith: 0, sWith: 0 }));
      t.nBase += w * c.nBase;
      t.sBase += w * c.sBase;
      t.nWith += w * c.nWith;
      t.sWith += w * c.sWith;
    }
  }
  const mean = (s: number, n: number) => (n > 0 ? s / n : null);
  const folds: FoldResult[] = [];
  let bN = 0, bS = 0, cN = 0, cS = 0;
  for (const year of spec.testYears) {
    let tnB = 0, tsB = 0, tnW = 0, tsW = 0;
    for (const [y, c] of years) {
      if (y >= year) continue;
      tnB += c.nBase;
      tsB += c.sBase;
      tnW += c.nWith;
      tsW += c.sWith;
    }
    const trainBase = mean(tsB, tnB);
    const trainWith = mean(tsW, tnW);
    const added = tnW >= spec.minTrainCampaigns && trainBase !== null && trainWith !== null && trainWith > trainBase;
    const test = years.get(year) ?? { nBase: 0, sBase: 0, nWith: 0, sWith: 0 };
    const chosenN = added ? test.nWith : test.nBase;
    const chosenS = added ? test.sWith : test.sBase;
    bN += test.nBase;
    bS += test.sBase;
    cN += chosenN;
    cS += chosenS;
    folds.push({ year, added, trainBase, trainWith, testBaseN: test.nBase, testChosenN: chosenN, testBase: mean(test.sBase, test.nBase), testChosen: mean(chosenS, chosenN) });
  }
  const oosBase = mean(bS, bN);
  const oosChosen = mean(cS, cN);
  return { folds, oosBase, oosChosen, oosBaseN: bN, oosChosenN: cN, gain: oosBase !== null && oosChosen !== null ? oosChosen - oosBase : null };
}

/** One rung: the walk-forward of `rule` on top of `base`, with its bootstrap. */
export function testRung(rows: readonly LadderRow[], base: readonly string[], rule: string, spec: WalkForwardSpec = DEFAULT_WALK_FORWARD): RungResult {
  const { cells } = aggregate(rows, base, rule);
  const real = walk(cells, new Array(cells.length).fill(1), spec);
  const gains: number[] = [];
  if (cells.length > 0 && spec.resamples > 0) {
    const rand = mulberry32(spec.seed);
    const w = new Uint32Array(cells.length);
    for (let b = 0; b < spec.resamples; b++) {
      w.fill(0);
      for (let k = 0; k < cells.length; k++) w[Math.floor(rand() * cells.length)]++;
      const g = walk(cells, w, spec).gain;
      if (g !== null) gains.push(g);
    }
  }
  gains.sort((a, b) => a - b);
  const pick = (q: number) => (gains.length ? gains[Math.min(gains.length - 1, Math.floor(q * gains.length))] : null);
  const pPositive = gains.length ? gains.filter((g) => g > 0).length / gains.length : null;
  const anyAdded = real.folds.some((f) => f.added);
  let kept = false;
  let reason: string;
  const refusedAny = real.folds.some((f) => f.testChosenN !== f.testBaseN) || rows.some((r) => passes(r, base) && r.refused.has(rule));
  if (!refusedAny) reason = "refused no campaign the current set takes";
  else if (!anyAdded) reason = "never improved the years before a test year, so never added";
  else if (real.oosChosenN < spec.minTestCampaigns) reason = `left ${real.oosChosenN} out-of-sample campaigns, under ${spec.minTestCampaigns}`;
  else if (real.gain === null || real.gain <= 0) reason = "did not improve the years it was not decided on";
  else if (pPositive === null || pPositive < spec.confidence) reason = `improved out of sample, but only ${((pPositive ?? 0) * 100).toFixed(0)}% of resamples agree (needs ${(spec.confidence * 100).toFixed(0)}%)`;
  else {
    kept = true;
    reason = "improved the years it was not decided on";
  }
  return { rule, kept, reason, ...real, pPositive, gainLow: pick(0.05), gainHigh: pick(0.95) };
}

function oosSummary(rows: readonly LadderRow[], rules: readonly string[], spec: WalkForwardSpec) {
  const years = new Set(spec.testYears);
  const kept = rows.filter((r) => years.has(yearOf(r)) && Number.isFinite(r.r) && passes(r, rules));
  const totalR = kept.reduce((s, r) => s + r.r, 0);
  return { n: kept.length, meanR: kept.length ? totalR / kept.length : null, totalR };
}

/**
 * Climb the ladder: each rung in order is tested on top of the rules kept so
 * far, and kept or dropped. The references are each tested alone on the core.
 */
export function runLadder(
  rows: readonly LadderRow[],
  ladder: readonly string[],
  references: readonly string[] = [],
  spec: WalkForwardSpec = DEFAULT_WALK_FORWARD,
): LadderResult {
  const kept: string[] = [];
  const steps: RungResult[] = [];
  for (const rule of ladder) {
    const step = testRung(rows, kept, rule, spec);
    steps.push(step);
    if (step.kept) kept.push(rule);
  }
  const refs = references.map((rule) => ({ ...testRung(rows, [], rule, spec), kept: false }));
  return { steps, references: refs, kept, coreOos: oosSummary(rows, [], spec), finalOos: oosSummary(rows, kept, spec) };
}

/** The ladder's result as lines for a job log: short, one rung a line. */
export function ladderReport(result: LadderResult): string {
  const f = (x: number | null, d = 3) => (x === null ? "n/a" : (x >= 0 ? "+" : "") + x.toFixed(d));
  const line = (s: RungResult) =>
    `${s.kept ? "KEEP" : "drop"} ${s.rule.padEnd(30)} gain ${f(s.gain)}R [${f(s.gainLow)}, ${f(s.gainHigh)}] p>0 ${s.pPositive === null ? "n/a" : (s.pPositive * 100).toFixed(0) + "%"} ` +
    `n ${s.oosChosenN}/${s.oosBaseN} added ${s.folds.filter((x) => x.added).map((x) => x.year).join(",") || "none"}: ${s.reason}`;
  return [
    `core out of sample: ${result.coreOos.n} campaigns, mean ${f(result.coreOos.meanR)}R, total ${f(result.coreOos.totalR, 1)}R`,
    ...result.steps.map(line),
    `kept: ${result.kept.join(", ") || "none"}`,
    `core + kept out of sample: ${result.finalOos.n} campaigns, mean ${f(result.finalOos.meanR)}R, total ${f(result.finalOos.totalR, 1)}R`,
    "references (each alone on the core, never kept):",
    ...result.references.map(line),
  ].join("\n");
}

const ROWS_HEADER = "symbol,date,r,refused";

/** Campaign rows as compact CSV, refusals joined by "|", for the job log and `scripts/rule-ladder.mjs`. */
export function ladderRowsCsv(rows: readonly LadderRow[]): string {
  const out = [ROWS_HEADER];
  for (const row of rows) {
    if (!Number.isFinite(row.r)) continue;
    out.push(`${row.symbol},${row.date},${row.r.toFixed(4)},${[...row.refused].sort().join("|")}`);
  }
  return out.join("\n") + "\n";
}

/** The inverse of `ladderRowsCsv`. Throws on a header or row it does not recognise. */
export function parseLadderRowsCsv(text: string): LadderRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines[0] !== ROWS_HEADER) throw new Error(`Not ladder rows: header ${JSON.stringify(lines[0])}`);
  return lines.slice(1).map((line, i) => {
    const [symbol, date, r, refused = ""] = line.split(",");
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !Number.isFinite(Number(r))) throw new Error(`Bad ladder row ${i + 2}: ${line}`);
    return { symbol, date, r: Number(r), refused: new Set(refused ? refused.split("|") : []) };
  });
}
