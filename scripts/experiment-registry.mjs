/**
 * Rebuilds the experiment registry (quant validation, slice 1): every replay
 * configuration GSPS has measured, the failures included, so a selection-bias
 * correction (the Deflated Sharpe Ratio, `lib/backtest/selectionBias.ts`)
 * counts the real number of tries instead of a guess.
 *
 * Usage:
 *   node scripts/experiment-registry.mjs --out docs/experiments/registry.json \
 *     docs/replay-runs /mnt/project-files/core-rebuild /mnt/project-files/rule-ladder \
 *     /mnt/project-files/replay-diagnosis
 *
 * What counts as a trial: each cell of a universe run's `summary.json`; each
 * replay file with an `overall` block; each cell of a replay file with a
 * `cells` array; each `COMBINED.json` of a sliced run; each cell of a bare
 * cell list (`[{ label, options }]`). Other JSON (study
 * outputs with `tests`, `draws` and the like) is listed as a study, with its
 * own test count where it states one, and not counted as a strategy trial.
 * A trial's figures are copied as they stand; nothing is recomputed.
 *
 * The registry is a lower bound: configurations tried and never written to a
 * file are not in it, and the report says so.
 */

import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Walk a directory to `depth`, returning JSON file paths, sorted. */
async function jsonFiles(dir, depth = 3) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) out.push(...(await jsonFiles(p, depth - 1)));
    else if (e.isFile() && e.name.endsWith(".json") && !e.name.endsWith(".report.json") && !/^slice\d+\.json$/.test(e.name) && e.name !== "manifest.json") out.push(p);
  }
  return out.sort();
}

function stat1(o) {
  if (!o || typeof o !== "object") return {};
  const n = o.n ?? o.trades ?? null;
  return {
    n: typeof n === "number" ? n : null,
    expectancyR: typeof o.expectancyR === "number" ? o.expectancyR : null,
    ci95: o.expectancyCI95 ?? o.ci ?? null,
  };
}

/** The trials and studies one parsed file holds. */
export function entriesOf(file, d) {
  const date = (path.basename(path.dirname(file)).match(/^\d{4}-\d{2}-\d{2}/) ?? path.basename(file).match(/^\d{4}-\d{2}-\d{2}/) ?? [null])[0];
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (Array.isArray(d.cells) && d.cells.length > 0 && d.cells[0] && typeof d.cells[0] === "object" && "label" in d.cells[0]) {
      return d.cells.map((c) => ({
        kind: "trial",
        source: file,
        date,
        label: c.label,
        options: c.options ?? null,
        timeframe: d.meta?.timeframe ?? d.timeframe ?? null,
        universe: d.meta?.universe ?? null,
        window: d.meta?.window ?? d.window ?? null,
        ...stat1(c.scopes?.all ?? c.overall ?? c),
        execute: stat1(c.scopes?.Execute),
      }));
    }
    if (d.overall && typeof d.overall === "object") {
      return [{ kind: "trial", source: file, date, label: path.basename(file, ".json"), options: null, timeframe: d.timeframe ?? null, universe: null, window: d.window ?? null, ...stat1(d.overall) }];
    }
    if (d.all_closed && typeof d.all_closed === "object") {
      return [{ kind: "trial", source: file, date, label: d.version ?? path.basename(path.dirname(file)), options: null, timeframe: "1Day", universe: null, window: null, ...stat1(d.all_closed), execute: stat1(d.Execute) }];
    }
    const tests = Array.isArray(d.tests) ? d.tests.length : null;
    return [{ kind: "study", source: file, date, label: d.run ?? path.basename(file, ".json"), tests }];
  }
  // A cell list written beside a run (e.g. daily_cells.json): each cell is a trial whose figures live elsewhere.
  if (Array.isArray(d) && d.length > 0 && d.every((c) => c && typeof c === "object" && typeof c.label === "string")) {
    return d.map((c) => ({ kind: "trial", source: file, date, label: c.label, options: c.options ?? null, timeframe: null, universe: null, window: null, n: null, expectancyR: null, ci95: null }));
  }
  return [{ kind: "study", source: file, date, label: path.basename(file, ".json"), tests: null }];
}

export async function buildRegistry(roots) {
  const entries = [];
  const unreadable = [];
  for (const root of roots) {
    const s = await stat(root).catch(() => null);
    const files = s?.isFile() ? [root] : await jsonFiles(root);
    for (const f of files) {
      try {
        entries.push(...entriesOf(f, JSON.parse(await readFile(f, "utf8"))));
      } catch {
        unreadable.push(f);
      }
    }
  }
  const trials = entries.filter((e) => e.kind === "trial");
  return {
    generatedAt: new Date().toISOString(),
    roots,
    trialCount: trials.length,
    studyCount: entries.length - trials.length,
    note: "A lower bound: configurations tried and never written to a file are not counted.",
    unreadable,
    entries,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const outAt = argv.indexOf("--out");
  if (outAt === -1 || !argv[outAt + 1]) throw new Error("--out <file> is required");
  const out = argv[outAt + 1];
  const roots = argv.filter((_, i) => i !== outAt && i !== outAt + 1);
  if (roots.length === 0) throw new Error("name at least one directory or file to read");
  const reg = await buildRegistry(roots);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(reg, null, 2) + "\n");
  process.stdout.write(`${reg.trialCount} trials, ${reg.studyCount} studies, ${reg.unreadable.length} unreadable → ${out}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}
