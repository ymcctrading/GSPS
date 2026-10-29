/**
 * Re-reads the rule ladder (docs/RULE_LADDER.md) from a tagged core run's
 * campaign rows, locally, so the ladder can be read again without spending
 * Actions minutes.
 *
 * Usage:
 *   node scripts/rule-ladder.mjs <rows>
 *
 * <rows> is any of: the run's `<cell>.ladder-rows.csv` (from the out/ directory
 * or the artifact, written at every checkpoint too), the same gzipped (`.gz`), or a saved job log holding the
 * `=== BEGIN ladder-rows.csv.gz.base64 ===` block (the log prefix on each line
 * is stripped).
 *
 * Prints the same report the job prints. The keep test is pre-registered in
 * lib/backtest/walkForward.ts (DEFAULT_WALK_FORWARD); this script takes no
 * options that change it.
 */

import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const BEGIN = "=== BEGIN ladder-rows.csv.gz.base64 ===";
const END = "=== END ladder-rows.csv.gz.base64 ===";

/** The rows' CSV text from a file of any of the three forms above. */
export function rowsText(buffer) {
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return gunzipSync(buffer).toString("utf8");
  const text = buffer.toString("utf8");
  const start = text.indexOf(BEGIN);
  if (start === -1) return text;
  const end = text.indexOf(END, start);
  if (end === -1) throw new Error("The log's ladder-rows block has no END marker: the log was cut off.");
  const encoded = text
    .slice(start + BEGIN.length, end)
    .split(/\r?\n/)
    // GitHub prefixes each log line with its timestamp; keep the base64 after it.
    .map((line) => line.trim().replace(/^\d{4}-\d{2}-\d{2}T\S*Z\s*/, ""))
    .filter((line) => /^[A-Za-z0-9+/=]+$/.test(line))
    .join("");
  return gunzipSync(Buffer.from(encoded, "base64")).toString("utf8");
}

/**
 * What a universe run prints for the ladder: the report, then the campaign
 * rows gzipped and base64-encoded in lines of 1,000 characters (about 30
 * bytes a campaign before compression), last in the log so a tail read gets
 * it. `wf` and `ladder` are the loaded `walkForward.ts` and `ruleLadder.ts`.
 */
export function ladderLogBlock(wf, ladder, rows) {
  const result = wf.runLadder(rows, ladder.RULE_LADDER.map((r) => r.name), ladder.REFERENCE_RULES);
  const encoded = gzipSync(Buffer.from(wf.ladderRowsCsv(rows), "utf8")).toString("base64");
  const lines = [];
  for (let i = 0; i < encoded.length; i += 1000) lines.push(encoded.slice(i, i + 1000));
  return `=== BEGIN rule ladder ===\n${rows.length} campaigns.\n${wf.ladderReport(result)}\n=== END rule ladder ===\n${BEGIN}\n${lines.join("\n")}\n${END}\n`;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node scripts/rule-ladder.mjs <ladder-rows.csv | .gz | job log>");
  const server = await createServer({
    configFile: false,
    root,
    resolve: { alias: { "@": root } },
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });
  try {
    const wf = await server.ssrLoadModule("/lib/backtest/walkForward.ts");
    const { RULE_LADDER, REFERENCE_RULES } = await server.ssrLoadModule("/lib/backtest/ruleLadder.ts");
    const rows = wf.parseLadderRowsCsv(rowsText(await readFile(path.resolve(file))));
    const result = wf.runLadder(rows, RULE_LADDER.map((r) => r.name), REFERENCE_RULES);
    process.stdout.write(`${rows.length} campaigns read.\n${wf.ladderReport(result)}\n`);
  } finally {
    await server.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
}
