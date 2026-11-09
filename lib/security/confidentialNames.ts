/**
 * Names of the confidential sources and of the named rules taken from them,
 * in every spelling an identifier can take: words, camelCase, snake_case and
 * hyphenated (AGENTS.md "Confidential sources", 2026-10-28). A test runs the
 * strings a browser receives (API fields and values, rendered copy) against
 * this list. `scripts/check-bundle-terms.mjs` keeps the same list for the
 * built bundle; change both together.
 */
const SEP = "[ _-]?";

export const CONFIDENTIAL_NAME_PATTERNS: readonly RegExp[] = [
  /gann/i,
  /jensen/i,
  /hermetic/i,
  /dewey/i,
  /hauck/i,
  /kybalion/i,
  /mikula/i,
  /bucholtz/i,
  /\b(planetary|heliocentric|geocentric|astrolog[a-z]*|ephemeris)\b/i,
  /Master Course|Tunnel Thru|Stock Selector|Observation of Cycles/i,
  new RegExp(`square${SEP}of${SEP}(nine|9|144|52|90|12|20)(?![0-9])`, "i"),
  new RegExp(`rule${SEP}of${SEP}three`, "i"),
  new RegExp(`seven${SEP}zones`, "i"),
  new RegExp(`overnight${SEP}(chart|turn)`, "i"),
  new RegExp(`three${SEP}day${SEP}chart`, "i"),
  new RegExp(`space${SEP}over${SEP}balanc`, "i"),
  new RegExp(`three${SEP}adverse${SEP}closes`, "i"),
  new RegExp(`boiling${SEP}point`, "i"),
];

/** The confidential names found in `text`, empty when it is clean. */
export function confidentialNamesIn(text: string): string[] {
  const found: string[] = [];
  for (const p of CONFIDENTIAL_NAME_PATTERNS) {
    const m = text.match(p);
    if (m) found.push(m[0]);
  }
  return found;
}
