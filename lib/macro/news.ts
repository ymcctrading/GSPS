/**
 * Macro / economic news feed.
 * -----------------------------------------------------------------------------
 * No news provider is wired into the seam yet (see `docs/THIRD_PARTY_LIMITS.md`
 * before adding one). Until then this generates a deterministic, clearly-labelled
 * demo feed shaped like a real economic calendar — impact tier, asset tags, a
 * clean headline — so the Market News module has something coherent to render
 * and the UI/layout can be built and reviewed against real-shaped data.
 *
 * Swap `generateNewsForRange` for a live feed by keeping the `NewsEvent` shape;
 * nothing downstream should need to change.
 */

export type ImpactTier = "high" | "medium" | "low";

export interface NewsEvent {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, 24h, US Eastern
  impact: ImpactTier;
  /** Country/region code the release applies to, e.g. "US", "EU". */
  region: string;
  headline: string;
  /** Tickers/assets this release is most relevant to. */
  assetTags: string[];
  /** One-line detail — prior/forecast style context where applicable. */
  detail?: string;
}

interface Template {
  headline: string;
  impact: ImpactTier;
  region: string;
  assetTags: string[];
  detail: string;
  /** Day-of-week bias, 0=Sun..6=Sat, matching when this release actually occurs. */
  weekday: number;
  time: string;
}

// A recurring macro calendar shaped like the real one — same releases repeat
// monthly, which is how the real economic calendar behaves.
const TEMPLATES: Template[] = [
  {
    headline: "Non-Farm Payrolls",
    impact: "high",
    region: "US",
    assetTags: ["SPY", "QQQ", "DXY"],
    detail: "Change in nonfarm employment vs. forecast.",
    weekday: 5,
    time: "08:30",
  },
  {
    headline: "CPI m/m",
    impact: "high",
    region: "US",
    assetTags: ["SPY", "QQQ", "BTC"],
    detail: "Headline and core inflation, month over month.",
    weekday: 3,
    time: "08:30",
  },
  {
    headline: "FOMC Rate Decision",
    impact: "high",
    region: "US",
    assetTags: ["SPY", "QQQ", "DXY", "BTC"],
    detail: "Federal funds rate decision and statement.",
    weekday: 3,
    time: "14:00",
  },
  {
    headline: "Fed Chair Press Conference",
    impact: "high",
    region: "US",
    assetTags: ["SPY", "QQQ"],
    detail: "Post-decision commentary and Q&A.",
    weekday: 3,
    time: "14:30",
  },
  {
    headline: "ISM Manufacturing PMI",
    impact: "medium",
    region: "US",
    assetTags: ["SPY", "CAT", "BA"],
    detail: "Manufacturing sector activity index.",
    weekday: 1,
    time: "10:00",
  },
  {
    headline: "Initial Jobless Claims",
    impact: "medium",
    region: "US",
    assetTags: ["SPY"],
    detail: "Weekly initial unemployment claims.",
    weekday: 4,
    time: "08:30",
  },
  {
    headline: "Retail Sales m/m",
    impact: "medium",
    region: "US",
    assetTags: ["WMT", "AMZN", "SPY"],
    detail: "Change in the total value of retail sales.",
    weekday: 2,
    time: "08:30",
  },
  {
    headline: "ECB Rate Decision",
    impact: "high",
    region: "EU",
    assetTags: ["DXY", "SPY"],
    detail: "European Central Bank main refinancing rate.",
    weekday: 4,
    time: "08:15",
  },
  {
    headline: "PPI m/m",
    impact: "medium",
    region: "US",
    assetTags: ["SPY"],
    detail: "Producer price inflation, month over month.",
    weekday: 2,
    time: "08:30",
  },
  {
    headline: "Consumer Confidence",
    impact: "low",
    region: "US",
    assetTags: ["SPY"],
    detail: "Conference Board consumer confidence index.",
    weekday: 1,
    time: "10:00",
  },
  {
    headline: "Crude Oil Inventories",
    impact: "low",
    region: "US",
    assetTags: ["XOM", "CVX"],
    detail: "EIA weekly petroleum status report.",
    weekday: 2,
    time: "10:30",
  },
  {
    headline: "GDP q/q (Advance)",
    impact: "high",
    region: "US",
    assetTags: ["SPY", "QQQ"],
    detail: "Advance estimate of quarterly GDP growth.",
    weekday: 4,
    time: "08:30",
  },
];

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic-but-varied event list for [from, to] inclusive (UTC calendar
 * days). Each template fires on its matching weekday, spaced roughly monthly by
 * a per-template seeded offset so releases don't all land on the same week.
 */
export function generateNewsForRange(from: Date, to: Date): NewsEvent[] {
  const events: NewsEvent[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));

  let i = 0;
  while (cursor <= end) {
    for (const t of TEMPLATES) {
      if (cursor.getUTCDay() !== t.weekday) continue;
      // Roughly monthly per template: only fire on the week-of-month that
      // hashes to this month, so each release appears about once a month.
      const weekOfMonth = Math.floor((cursor.getUTCDate() - 1) / 7);
      const targetWeek = hashWeek(`${t.headline}|${cursor.getUTCMonth()}`);
      if (weekOfMonth !== targetWeek) continue;

      events.push({
        id: `${t.headline}-${toDateInput(cursor)}-${i++}`,
        date: toDateInput(cursor),
        time: t.time,
        impact: t.impact,
        region: t.region,
        headline: t.headline,
        assetTags: t.assetTags,
        detail: t.detail,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

function hashWeek(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 4; // week 0-3 of the month
}
