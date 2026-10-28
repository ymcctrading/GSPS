/**
 * The name a person reads for a version of the rules. `STRATEGY_VERSION`
 * strings describe the rule each change built, in the method's own words,
 * so they stay on the server (AGENTS.md, "Confidential sources", 2026-10-28).
 * A screen gets the version's date and a short, stable tag: the same version
 * always reads the same, so the forward test and the replay still pair up.
 */

export function publicVersionLabel(version: string): string;
export function publicVersionLabel(version: string | null): string | null;
export function publicVersionLabel(version: string | null): string | null {
  if (version == null) return null;
  const date = version.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  // FNV-1a, 32-bit: deterministic and enough to tell a day's versions apart.
  let h = 0x811c9dc5;
  for (let i = 0; i < version.length; i++) {
    h ^= version.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const tag = h.toString(36).padStart(7, "0").slice(-5);
  return date ? `${date} · ${tag}` : `v-${tag}`;
}
