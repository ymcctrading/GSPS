/**
 * The support and resistance list both surfaces build (lib/scanTicker.ts and
 * lib/backtest/replay.ts#buildMacroContext), in one place since 2026-10-21 so
 * the two cannot drift. It feeds stops, TP1, MTP and the confluence card
 * (`all`), and `historicalSR` reads its old levels only (`old`, see
 * `lib/gann/heldLevel.ts`).
 *
 * The order is the one both surfaces had: the daily pivots, then the old
 * levels (weekly and monthly pivots, Gann's percentage levels, the campaign
 * bottoms, the secondary turn), then the lattices (`gannMasterLevels`).
 *
 * Three-question basis:
 * 1. Gann: carries his levels unchanged (W006 pp.19-24; A-LEVELS-02, -03;
 *    the Master Calculator and planetary averages, `masterLevels.ts`).
 * 2. Cycles: no periodicity claim; Dewey does not apply.
 * 3. Hermetic: Correspondence (one list, live and in the measurement of it).
 */
import type { Bar, Timeframe, TrendReading } from "@/lib/types";
import { majorPricePercentageLevels } from "@/lib/gann/disclosedRules";
import { campaignSupportLevels, readCampaignBottoms } from "@/lib/gann/campaignBottoms";
import { secondaryTurnLevels, type CampaignLedger } from "@/lib/gann/campaignLedger";
import { gannMasterLevels } from "@/lib/gann/masterLevels";

export interface StructuralLevel {
  price: number;
  timeframe: Timeframe;
}

export function buildStructuralLevels(input: {
  trends: { daily: TrendReading; weekly: TrendReading; monthly: TrendReading };
  charts: { daily: Bar[]; monthly: Bar[] };
  campaign: CampaignLedger | null;
  price: number;
  asOf: Date;
}): { all: StructuralLevel[]; old: StructuralLevel[] } {
  const { trends, charts, campaign, price, asOf } = input;
  const pivots = (t: TrendReading) => [
    ...t.support.map((p) => ({ price: p, timeframe: t.timeframe })),
    ...t.resistance.map((p) => ({ price: p, timeframe: t.timeframe })),
  ];
  const old: StructuralLevel[] = [
    ...pivots(trends.weekly),
    ...pivots(trends.monthly),
    // Gann's major percentage-of-price levels, anchored on the monthly
    // history's extremes (2026-09-27). See majorPricePercentageLevels.
    ...majorPricePercentageLevels([...charts.monthly, ...charts.daily]).map((p) => ({ price: p, timeframe: "1Month" as const })),
    // The old campaign bottoms Gann looks to in turn (A-LEVELS-03, step 8).
    ...campaignSupportLevels(readCampaignBottoms(charts.monthly, charts.daily, asOf), price).map((p) => ({ price: p, timeframe: "1Month" as const })),
    // The campaign's secondary rally top (reaction bottom), A-LEVELS-02.
    ...secondaryTurnLevels(campaign).map((p) => ({ price: p, timeframe: "1Week" as const })),
  ];
  const all: StructuralLevel[] = [
    ...pivots(trends.daily),
    ...old,
    // Gann's Square of 144 squares, his planetary averages and the other
    // lattices, as price resistance (2026-09-30). See lib/gann/masterLevels.ts.
    ...gannMasterLevels([...charts.monthly, ...charts.daily], charts.daily, price, asOf).map((l) => ({
      price: l.price,
      timeframe: "1Month" as const,
    })),
  ];
  return { all, old };
}
