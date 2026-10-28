/**
 * GSPS — /api/industries
 * GET: every symbol the platform lists, by sector and industry
 * (`lib/universe/industries.ts`), plus the curated quick picks saved searches
 * still name. Read by the Scanner's and the Test page's industry pickers, so
 * the classification data stays out of the client bundle.
 */

import { NextResponse } from "next/server";
import { industryTree } from "@/lib/universe/industries";
import { MAG7, SECTORS } from "@/lib/sectors";
import { isQuotesOnly, type PickerList, type PickerSector } from "@/lib/universe/selection";

export const dynamic = "force-static";

export function GET() {
  // The Magnificent 7 is offered as a quick pick; the older curated lists are
  // returned so a saved search that names one still resolves to the same symbols.
  const lists: PickerList[] = [
    { key: "mag7", label: "Magnificent 7", symbols: [...MAG7] },
    ...Object.entries(SECTORS)
      .filter(([key]) => key !== "mag7")
      .map(([key, { label, symbols }]) => ({ key, label, symbols })),
  ];
  // Futures and forex can't be scanned yet (quotes only), so they are named
  // apart instead of offered.
  const sectors: PickerSector[] = [];
  const unavailable: string[] = [];
  for (const s of industryTree()) {
    const industries = s.industries.filter((i) => !i.symbols.every(isQuotesOnly));
    if (industries.length > 0) sectors.push({ ...s, industries });
    else unavailable.push(s.label);
  }
  return NextResponse.json({
    sectors,
    lists: lists.filter((l) => !l.symbols.every(isQuotesOnly)),
    unavailable,
  });
}
