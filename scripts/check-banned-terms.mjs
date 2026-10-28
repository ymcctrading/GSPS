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

/**
 * Directories or exact file paths whose contents are exempt, with the
 * reason they are exempt.
 */
const SKIPPED_DIRECTORIES = [
  // Tests name the banned terms in order to assert they are absent.
  "lib/__tests__",
  // Standalone Python research module with its own docs and vocabulary.
  "lib/confluence-scanner",
  // Documents the banned-term → approved-label mapping table itself, the
  // same reason this script's own "instead" field is allowed to say them.
  "lib/constants/gspsTerminology.ts",
  "node_modules",
  ".next",
];

/**
 * Exact files whose PMG occurrences are the internal pattern-name literal
 * (`StratPattern["name"]`), not rendered copy — the discriminated-union tag
 * kept unchanged for the same reason `GannLevels`/`StratPattern` identifiers
 * are unchanged. Every user-facing string built from it (badges, glossary,
 * education copy, generated descriptions) goes through
 * `PATTERN_GLOSSARY_TERM`, which these files are not exempt from — only the
 * bare `PMG` tag is.
 */
const PMG_IDENTIFIER_FILES = [
  "lib/types.ts",
  "lib/strat/patterns.ts",
  "lib/education/patterns.ts",
  "lib/scanTicker.ts",
  // The pattern ranking moved here from lib/scanTicker.ts (2026-09-25) so the
  // live scan and the backtest replay share it; same bare tag, no copy.
  "lib/scan/entrySelection.ts",
  // Strategy Modes (docs/STRATEGY_MODES.md): ranks patterns by the same bare
  // tag, and renders only PATTERN_GLOSSARY_TERM's approved label.
  "lib/strategies/saraStrat.ts",
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
  { pattern: /\bGann\b/, term: "Gann", instead: "structural / support / key price level" },
  { pattern: /\bStrat\b/, term: "Strat", instead: "reversal pattern" },
  // All-caps "STRAT" only — the case that slips past the identifier-safe
  // pattern above without also matching lowercase `lib/strat/...` import
  // paths (case-sensitive on purpose, see the pattern above).
  { pattern: /\bSTRAT\b/, term: "STRAT", instead: "reversal pattern" },
  { pattern: /\bPMG\b/i, term: "PMG", instead: "momentum exhaustion reversal" },
  { pattern: /\bSquare[ -]of[ -](9|Nine)\b/i, term: "Square of 9", instead: "key price level" },
  { pattern: /\bS9\b/, term: "S9", instead: "key level" },
  { pattern: /\bHarmonic\b/, term: "Harmonic", instead: "structural / key price level" },
  { pattern: /\bDigital Root(s)?\b/i, term: "Digital Root", instead: "GSPS Signal Calculation" },
  { pattern: /\bVortex\b/i, term: "Vortex", instead: "signal flow" },
  { pattern: /\bPivot Machine Gun\b/i, term: "Pivot Machine Gun", instead: "Momentum reversal (PMG)" },
  { pattern: /\b2-(up|down) bar\b/i, term: "2-up/2-down bar", instead: "the up bar / the down bar" },
  // GSPS School's spec traces its Three-Element Method to Hermetic/alchemical
  // source material (see docs/GSPS_SCHOOL.md); that lineage is fine as design
  // rationale in comments and internal docs, but the product itself must read
  // as plain trading education, not insider/esoteric framing.
  { pattern: /Philosopher's Stone/i, term: "Philosopher's Stone", instead: "GSPS School" },
  // "Mr. Bull" and "Mrs. Bear" were banned here until 2026-09-28, when the
  // project owner made them the learner's named guides in GSPS School lesson
  // text ("They are our guides"). See docs/GSPS_BRAND_GUIDE.md.
  { pattern: /\bHermetic\b/i, term: "Hermetic", instead: "(omit — plain educational-governance language)" },
];

/**
 * Confidential sources (owner, 2026-10-28, top priority): nothing on the
 * platform, public or private, names W.D. Gann's methods or formulas, L.J.
 * Jensen, Dewey/Thomas, the cycles literature or the hermetic principles, or
 * the books they come from. GSPS presents itself as a stock trading and
 * scanning application. Internal code and project files may cite the sources
 * in comments; rendered copy, school text, emails, notifications and any
 * string a client component imports may not. Scanned, comments and imports
 * skipped, on the surfaces that render copy (`CONFIDENTIAL_ROOTS`); the server
 * modules that compute the method keep their names and trace lines, which the
 * API boundary strips (`lib/scoring/public-summary.ts`).
 */
const CONFIDENTIAL_ROOTS = [
  "app",
  "components",
  "lib/school",
  "lib/education",
  "lib/notifications",
  "lib/scanner/intradayDisplay.ts",
  "lib/trade/tradeStyle.ts",
  "lib/trade/protocol-rules.ts",
  "lib/trade/protocol-exit.ts",
  "lib/scanner/intraday.ts",
  "lib/scanner/focusList.ts",
  "lib/setups",
  "lib/lifecycle",
  "lib/onboarding",
  "lib/scoring/public-summary.ts",
  "lib/scoring/direction-copy.ts",
  // Added 2026-10-28 (independent check of the rule): the owner's evening
  // emails, every exit and order note a member reads (lib/trade,
  // lib/automation) and the Context card's server-built sentences.
  "lib/reports",
  "lib/trade",
  "lib/automation",
  "lib/signals/contextLines.ts",
];
const CONFIDENTIAL_TERMS = [
  { pattern: /\bJensen\b/i, term: "Jensen" },
  { pattern: /\bDewey\b/i, term: "Dewey" },
  { pattern: /\bHauck\b/i, term: "Hauck" },
  { pattern: /\bKybalion\b/i, term: "Kybalion" },
  { pattern: /\bTomes\b/, term: "Tomes" },
  { pattern: /\bMikula\b/i, term: "Mikula" },
  { pattern: /\bBucholtz\b/i, term: "Bucholtz" },
  { pattern: /Observation of Cycles|Study of Cycles/i, term: "cycles literature" },
  { pattern: /Master (Stock Market )?Course|Tunnel Thru|Stock Selector|Truth of the Stock Tape|45 Years in Wall Street|How to Make Profits/i, term: "source book title" },
  { pattern: /\bSquare[ -]of[ -](144|52|90|12|4|20)\b/i, term: "Square of N", instead: "a neutral level or timing label" },
  { pattern: /\bRule of Three\b/i, term: "Rule of Three", instead: "three closes in a row" },
  { pattern: /\b3-Day Chart\b|\bOvernight Chart\b/, term: "named swing chart", instead: "daily swing chart" },
  { pattern: /\bSeven Zones\b/i, term: "Seven Zones", instead: "activity zones" },
  { pattern: /\b(planetary|heliocentric|geocentric|astrolog\w*|ephemeris)\b/i, term: "astrology" },
  { pattern: /Law of Creation|Emerald Tablet|Three Initiates/i, term: "hermetic source" },
  // The entry and stop arithmetic itself ("a close 3 points past the old
  // level", "1 point above the top"): the plan's prices show, the rule doesn't.
  { pattern: /\b\d+[ -]points? (past|beyond|over|under|above|below|ahead|back)\b/, term: "point arithmetic", instead: "clearly past / just beyond" },
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
  const rel = relative(ROOT, file);
  const isPmgIdentifierFile = PMG_IDENTIFIER_FILES.some((f) => rel === f || rel.split("\\").join("/") === f);
  const terms = isPmgIdentifierFile ? USER_FACING_TERMS.filter((t) => t.term !== "PMG") : USER_FACING_TERMS;
  scan(file, PRODUCT_NAMES, { skipCommentsAndImports: false });
  scan(file, terms, { skipCommentsAndImports: true });
}
const confidentialFiles = CONFIDENTIAL_ROOTS.flatMap((root) =>
  root.endsWith(".ts") ? [join(ROOT, root)] : walk(join(ROOT, root)),
);
for (const file of confidentialFiles) {
  // Tests name the old wording to assert it is gone.
  if (/__tests__|\.test\.tsx?$/.test(file)) continue;
  scan(file, CONFIDENTIAL_TERMS, { skipCommentsAndImports: true });
}
for (const doc of PUBLIC_DOCS) {
  scan(join(ROOT, doc), PRODUCT_NAMES, { skipCommentsAndImports: false });
  // The public docs are read whole, so the source names count everywhere in them.
  scan(join(ROOT, doc), [...USER_FACING_TERMS.filter((t) => t.term === "Gann" || t.term === "Hermetic"), ...CONFIDENTIAL_TERMS], { skipCommentsAndImports: false });
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
