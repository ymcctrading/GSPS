/**
 * The member's choice of Dashboard sections (Q3 plan item 4, `docs/Q3_PLAN.md`):
 * each section can be shown, hidden and moved up or down, saved per member under
 * `settings.prefs.dashboard`. No table or migration; `prefs` is shared, so a
 * write merges into the prefs it read (see `/api/settings/dashboard`).
 *
 * The default order is the Dashboard as it stood before this choice existed, so
 * a member who never opens the setting sees no change. Novice keeps the
 * Guided-first layout as its default: its summary card ("summary") leads, and
 * it renders only on a Novice account, so other tiers' defaults start with the
 * School nudge or the walkthrough link.
 *
 * Not choosable, and kept above every section: the welcome banner, the rest
 * reminder (the trader's own rest rule, `lib/gann/traderPrefs.ts`) and the
 * stale-scan notice. Each says something about the data or the trader that a
 * hidden card would leave unsaid.
 *
 * A full drag-and-drop widget grid is held until members ask for it (plan).
 *
 * Three-question basis: 1. Method: none; this is layout. 2. Cycles: no
 * periodicity claim. 3. Hermetic: Polarity, the novice and the expert each get
 * a designed view (the Guided-first default, and a page the expert arranges),
 * not a shortened list. Law of Creation: the designed default ⊗ the member's
 * choice, a page arranged for how this member reads it, which neither held
 * alone; it re-enters as the default the member returns to.
 */

import { z } from "zod";

export const DASHBOARD_SECTION_IDS = [
  "summary",
  "school",
  "walkthrough",
  "expectancy",
  "tracked",
  "saved",
  "watchlist",
  "setups",
  "intraday",
  "calendar",
] as const;

export type DashboardSectionId = (typeof DASHBOARD_SECTION_IDS)[number];

export interface DashboardSectionInfo {
  id: DashboardSectionId;
  label: string;
  /** Who sees it at all, when that is not every member. */
  note?: string;
}

/** In default order. Labels are member-facing. */
export const DASHBOARD_SECTIONS: readonly DashboardSectionInfo[] = [
  { id: "summary", label: "Your next step", note: "Novice accounts only" },
  { id: "school", label: "School progress", note: "Novice and Pro" },
  { id: "walkthrough", label: "Link to the walkthrough" },
  { id: "expectancy", label: "Live expectancy" },
  { id: "tracked", label: "Your tracked Execute setups", note: "When you have any" },
  { id: "saved", label: "Saved setups" },
  { id: "watchlist", label: "Watchlist" },
  { id: "setups", label: "Buy and sell setups" },
  { id: "intraday", label: "Intraday alerts" },
  { id: "calendar", label: "Earnings calendar and market news" },
];

export interface DashboardLayout {
  /** Every section id, once each, in the member's order. */
  order: DashboardSectionId[];
  hidden: DashboardSectionId[];
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  order: [...DASHBOARD_SECTION_IDS],
  hidden: [],
};

const ID_SET: ReadonlySet<string> = new Set(DASHBOARD_SECTION_IDS);
const isId = (v: unknown): v is DashboardSectionId => typeof v === "string" && ID_SET.has(v);

/** What a client may send: known ids only, no repeats, at most every section. */
export const DashboardLayoutSchema = z.object({
  order: z
    .array(z.enum(DASHBOARD_SECTION_IDS))
    .max(DASHBOARD_SECTION_IDS.length)
    .refine((ids) => new Set(ids).size === ids.length, "Each section once"),
  hidden: z
    .array(z.enum(DASHBOARD_SECTION_IDS))
    .max(DASHBOARD_SECTION_IDS.length)
    .refine((ids) => new Set(ids).size === ids.length, "Each section once"),
});

/**
 * The layout to render from whatever is stored. Unknown or repeated ids are
 * dropped, so a section later retired leaves nothing behind. A section the
 * stored order doesn't name (one added after the member saved) goes in just
 * after the section that precedes it by default, and is shown.
 */
export function normalizeDashboardLayout(raw: unknown): DashboardLayout {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const storedOrder = Array.isArray(obj.order) ? obj.order : [];
  const storedHidden = Array.isArray(obj.hidden) ? obj.hidden : [];

  const order: DashboardSectionId[] = [];
  for (const id of storedOrder) if (isId(id) && !order.includes(id)) order.push(id);
  DASHBOARD_SECTION_IDS.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = i > 0 ? order.indexOf(DASHBOARD_SECTION_IDS[i - 1]) : -1;
    order.splice(before + 1, 0, id);
  });

  const hidden: DashboardSectionId[] = [];
  for (const id of storedHidden) if (isId(id) && !hidden.includes(id)) hidden.push(id);
  return { order, hidden };
}

/** The member's layout from their `settings.prefs`. */
export function readDashboardLayout(prefs: Record<string, unknown> | null | undefined): DashboardLayout {
  return normalizeDashboardLayout(prefs?.dashboard);
}

/** The prefs to store after saving `layout`; every other key is kept. */
export function applyDashboardLayout(
  prefs: Record<string, unknown>,
  layout: DashboardLayout,
): { prefs: Record<string, unknown>; layout: DashboardLayout } {
  const next = normalizeDashboardLayout(layout);
  return { prefs: { ...prefs, dashboard: next }, layout: next };
}

/** The ids to render, in order, without the hidden ones. */
export function visibleDashboardSections(layout: DashboardLayout): DashboardSectionId[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((id) => !hidden.has(id));
}

/** `order` with `id` moved one place up (-1) or down (+1); unchanged at an end. */
export function moveDashboardSection(
  order: readonly DashboardSectionId[],
  id: DashboardSectionId,
  step: -1 | 1,
): DashboardSectionId[] {
  const next = [...order];
  const i = next.indexOf(id);
  const j = i + step;
  if (i < 0 || j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
