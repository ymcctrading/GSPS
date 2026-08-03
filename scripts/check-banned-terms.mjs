#!/usr/bin/env node
/**
 * Terminology gate.
 *
 * The product does not present itself in Gann/Strat vocabulary. Two earlier
 * passes removed it from the components, but the confluence checklist reads
 * from strings *generated* in lib/scoring/score.ts, so "Gann fan angle
 * proximity" and "Strat pattern armed" kept rendering while the gate — which
 * only looked at app/page.tsx, README.md and FEATURES.md — stayed green.
 *
 * Two tiers, because they protect different things:
 *
 *   Tier A — product names. Never appear anywhere: source or public docs.
 *   Tier B — user-facing vocabulary. Banned in the source that renders copy,
 *            but the internal implementation keeps its names, so this tier
 *            skips comments, import specifiers and tests, and its patterns are
 *            case-sensitive and word-bounded so identifiers (`GannLevels`,
 *            `StratPattern`, `gann.fanLines`, `showGann`) do not trip it.
 *
 * Executed strings — the ones that caused the regression — are additionally
 * asserted at runtime by lib/__tests__/user-copy.test.ts. This file is the
 * static half; that one is the behavioural half.
 *
 * Usage: node scripts/check-banned-terms.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath rather than URL.pathname: the latter leaves percent-encoding
// in place, so a checkout under a path with a space resolves to nothing.
const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[/\\]$/, "");

const SOURCE_ROOTS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const PUBLIC_DOCS = ["README.md", "FEATURES.md"];

/** Directories whose contents are exempt, with the reason they are exempt. */
const SKIPPED_DIRECTORIES = [
  // Tests name the banned terms in order to assert they are absent.
  "lib/__tests__",
  // Standalone Python research module with its own docs and vocabulary.
  "lib/confluence-scanner",
  "node_modules",
  ".next",
];

/** Product names. Banned everywhere, in any casing, comments included. */
const PRODUCT_NAMES = [
  { pattern: /Gann Protocol/i, term: "Gann Protocol" },
  { pattern: /Sara Sniper/i, term: "Sara Sniper" },
  { pattern: /sniper entr/i, term: "sniper entry" },
  { pattern: /W\.D\. ?Gann/i, term: "W.D. Gann" },
];

/**
 * User-facing vocabulary. Case-sensitive and word-bounded on purpose: the
 * banned forms are how the terms appear in prose, while the permitted forms
 * are how they appear in code (`GannLevels`, `gann.fanLines`, `StratPattern`,
 * `squareOf9`, `const s9 = ...`), which these patterns cannot match.
 */
const USER_FACING_TERMS = [
  { pattern: /\bGann\b/, term: "Gann", instead: "structural / support / harmonic" },
  { pattern: /\bStrat\b/, term: "Strat", instead: "reversal pattern" },
  { pattern: /\bSquare[ -]of[ -](9|Nine)\b/i, term: "Square of 9", instead: "harmonic level" },
  { pattern: /\bS9\b/, term: "S9", instead: "Harmonic" },
  { pattern: /\bPivot Machine Gun\b/i, term: "Pivot Machine Gun", instead: "Momentum reversal (PMG)" },
  { pattern: /\b2-(up|down) bar\b/i, term: "2-up/2-down bar", instead: "the up bar / the down bar" },
];

function walk(directory, files = []) {
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return files; // Root does not exist in this checkout; nothing to scan.
  }
  for (const entry of entries) {
    const absolute = join(directory, entry);
    const rel = relative(ROOT, absolute);
    if (SKIPPED_DIRECTORIES.some((skip) => rel === skip || rel.startsWith(`${skip}/`))) continue;
    if (statSync(absolute).isDirectory()) walk(absolute, files);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) files.push(absolute);
  }
  return files;
}

const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/**
 * Import specifiers carry the internal directory names (`@/lib/gann/fans`),
 * which are deliberately unchanged, so the paths themselves are not copy.
 */
const isModuleSpecifier = (line) =>
  /^\s*(import|export)\b[^;]*\bfrom\s*["']/.test(line) ||
  /^\s*import\s*\(/.test(line) ||
  /\brequire\s*\(/.test(line);

const violations = [];

function scan(file, terms, { skipCommentsAndImports }) {
  const rel = relative(ROOT, file);
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return;
  }
  contents.split("\n").forEach((line, index) => {
    if (skipCommentsAndImports && (isComment(line) || isModuleSpecifier(line))) return;
    for (const { pattern, term, instead } of terms) {
      if (pattern.test(line)) {
        violations.push({ file: rel, line: index + 1, term, instead, text: line.trim() });
      }
    }
  });
}

const sourceFiles = SOURCE_ROOTS.flatMap((root) => walk(join(ROOT, root)));

for (const file of sourceFiles) {
  scan(file, PRODUCT_NAMES, { skipCommentsAndImports: false });
  scan(file, USER_FACING_TERMS, { skipCommentsAndImports: true });
}
for (const doc of PUBLIC_DOCS) {
  scan(join(ROOT, doc), PRODUCT_NAMES, { skipCommentsAndImports: false });
}

if (violations.length > 0) {
  console.error(`\n${violations.length} banned term(s) found in user-facing text:\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    "${v.term}" is not user-facing vocabulary${v.instead ? ` — use ${v.instead}` : ""}.\n`);
  }
  console.error("Internal identifiers, comments and lib/gann|lib/strat imports are exempt;");
  console.error("if this is one of those, the match is in rendered copy rather than code.\n");
  process.exit(1);
}

console.log(`No banned terminology in ${sourceFiles.length} source files + ${PUBLIC_DOCS.length} public docs.`);
