#!/usr/bin/env node
/**
 * The other half of the confidential-terms gate (AGENTS.md, "Confidential
 * sources", 2026-10-28): `check-banned-terms.mjs` reads the copy in the
 * source, but any string a client component imports ships in the browser's
 * JavaScript, identifiers and object keys included. This reads what the
 * browser actually receives, the built `.next/static`, and fails on a name
 * of the sources. Run after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const STATIC = join(ROOT, ".next", "static");

const TERMS = [
  /gann/i,
  /jensen/i,
  /hermetic/i,
  /dewey/i,
  /hauck/i,
  /kybalion/i,
  /mikula/i,
  /bucholtz/i,
  /Square[ -]of[ -](Nine|9|144|52|90)/i,
  /\b(planetary|heliocentric|geocentric|astrolog[a-z]*|ephemeris)\b/i,
  /Rule of Three|Seven Zones|Overnight Chart|Master Course|Tunnel Thru|Stock Selector|Observation of Cycles/i,
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(js|css|html|json|txt)$/.test(entry)) out.push(path);
  }
  return out;
}

let files;
try {
  files = walk(STATIC);
} catch {
  console.error("No .next/static found. Run `npm run build` first.");
  process.exit(1);
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const term of TERMS) {
    const global = new RegExp(term.source, term.flags.includes("g") ? term.flags : `${term.flags}g`);
    for (const m of text.matchAll(global)) {
      const start = Math.max(0, m.index - 40);
      hits.push({ file: file.slice(ROOT.length), text: text.slice(start, m.index + m[0].length + 40).replace(/\s+/g, " ") });
      if (hits.length > 50) break;
    }
  }
}

if (hits.length > 0) {
  console.error(`\n${hits.length} confidential name(s) in the browser bundle:\n`);
  for (const h of hits) console.error(`  ${h.file}\n    …${h.text}…\n`);
  console.error("A client component imports a string, key or identifier that names a source.");
  console.error("Rename it, or keep it on the server and send the client a neutral field.\n");
  process.exit(1);
}
console.log(`No confidential names in ${files.length} built browser files.`);
