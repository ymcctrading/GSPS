/**
 * The charts a member opened most recently, newest first, so the header can
 * take them back to one from any page (owner, 2026-10-28: "there is currently
 * no way to get back to the chart page").
 *
 * A per-browser convenience in localStorage, never shared or relied on: an
 * empty or blocked store just shows no list. Cleared on sign-out, since the
 * practice account is shared between visitors.
 */

const KEY = "gsps:recent-charts:v1";
/** How many the menu lists. */
export const MAX_RECENT_CHARTS = 5;
/** Fired on `window` when the list changes in this tab. */
export const RECENT_CHARTS_EVENT = "gsps:recent-charts";

/** The list with `symbol` moved to the front, upper-cased, de-duplicated and capped. */
export function withRecentChart(list: readonly string[], symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s) return list.slice(0, MAX_RECENT_CHARTS);
  return [s, ...list.filter((x) => x !== s)].slice(0, MAX_RECENT_CHARTS);
}

export function readRecentCharts(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string" && s.length > 0).slice(0, MAX_RECENT_CHARTS)
      : [];
  } catch {
    return [];
  }
}

function write(list: string[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Blocked storage: the menu stays as it was.
  }
  try {
    window.dispatchEvent(new Event(RECENT_CHARTS_EVENT));
  } catch {
    // No window to notify.
  }
}

export function rememberRecentChart(symbol: string): void {
  const next = withRecentChart(readRecentCharts(), symbol);
  write(next);
}

export function clearRecentCharts(): void {
  write([]);
}
