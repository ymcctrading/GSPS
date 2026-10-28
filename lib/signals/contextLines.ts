/**
 * The ticker page's Context card, written as sentences on the server.
 * -----------------------------------------------------------------------------
 * Owner, 2026-10-28: nothing on the platform names the method's sources or
 * constructions (AGENTS.md "Confidential sources"), and that covers API field
 * names over time. The card used to receive the confluence modules' readings
 * (`lib/signals/confluence/gann.ts`, `sara.ts`) under their own field names
 * and build its sentences in the browser, so every reading's name crossed the
 * wire. Now the sentences are built here, in plain trading words, and only
 * they cross (`toPublicContext`, called by `redactScanResult`). A time reading
 * shows only with its measured record (CYC-30/CYC-47, `lib/gann/timeRecords.ts`).
 *
 * Informational only: none of it changes `decision`, a tradeable verdict or
 * account eligibility.
 */

import type { GannConfluenceResult, SaraConfluenceResult } from "@/lib/signals/confluence/types";
import type { ContextLine, ContextRead, PublicContext } from "@/lib/types";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import { TIME_LINE_RECORDS } from "@/lib/gann/timeRecords";

/** The note a market with no data path shows, in place of the module's own. */
const UNSUPPORTED_NOTE = "Not available for this market yet.";

/**
 * One plain sentence per reading. Optional-chained because a reading may be
 * missing on an older or partial result.
 */
const COUNTER_MOVE_LABEL = {
  normal: "a normal length (2-3 weeks)",
  extended: "longer than usual",
  secondMonth: "into a second month",
  thirdMonth: "past two months",
} as const;

const recordNote = (r: { summary: string } | null | undefined) => (r ? `(${r.summary.replace(/^Measured: /, "measured: ")})` : undefined);

/**
 * One plain sentence per reading. Optional-chained because scan results cached
 * before a field existed don't carry it.
 */
function levelLines(g: GannConfluenceResult): ContextLine[] {
  const lines: ContextLine[] = [];
  const rec = TIME_LINE_RECORDS;
  const px = (n: number) => n.toFixed(2);

  if (g.nearestSquareOf9) {
    lines.push({ text: `The nearest key price level is ${px(g.nearestSquareOf9.price)}, acting as ${g.nearestSquareOf9.role}.` });
  }
  if (g.nearestFanLine) {
    lines.push({ text: `A trend line from the last ${g.nearestFanLine.anchor.kind} sits at ${px(g.nearestFanLine.price)}.` });
  }
  if (rec.timeCycle) {
    lines.push({ text: g.timeCycleActive ? "A timing window is open." : "No timing window is open.", note: recordNote(rec.timeCycle) });
  }
  if (rec.macroCycle && g.macroCycle.majorActive) {
    lines.push({ text: "A long-term timing window is open.", note: recordNote(rec.macroCycle) });
  }
  if (rec.squareOf52 && g.squareOf52.active) lines.push({ text: "A weekly timing window is open.", note: recordNote(rec.squareOf52) });
  if (rec.angleMonthCounts && g.angleMonthCounts.active) lines.push({ text: "A monthly timing window is open.", note: recordNote(rec.angleMonthCounts) });
  if (g.spectralCycle.active && g.spectralCycle.dominantPeriodBars) {
    lines.push({ text: `Recent prices show a rough rhythm of about ${g.spectralCycle.dominantPeriodBars} bars.`, note: "(unproven)" });
  }
  if (g.campaignLeg.legNumber != null) {
    lines.push({ text: `This move looks like leg ${g.campaignLeg.legNumber} of the trend (${g.campaignLeg.confidence} confidence).` });
  }
  if (g.boilingPoint.length > 0) {
    lines.push({ text: `It has been ${g.boilingPoint[0].weeksSinceClimax} weeks since the last blow-off move (${g.boilingPoint[0].phase}).` });
  }

  const rules = g.disclosedRules;
  if (!rules) return lines;
  const CONTEXT_NOTE = "Context only; it does not change the setup.";

  if (rules.counterMove?.inCounterMove && rules.counterMove.phase) {
    lines.push({ text: `The current pullback has run ${rules.counterMove.days} days, ${COUNTER_MOVE_LABEL[rules.counterMove.phase]}.` });
  }
  if (rules.campaign?.counterMoveThirdMonth) {
    lines.push({ text: "The pullback from the last top is still making new extremes in its third month, which often means the trend has changed." });
  }
  const pct = rules.pricePercentages;
  if (pct?.nearestAbove || pct?.nearestBelow) {
    lines.push({ text: `Nearby percentage levels: ${pct.nearestBelow ? px(pct.nearestBelow.price) : "none"} below, ${pct.nearestAbove ? px(pct.nearestAbove.price) : "none"} above.` });
  }
  for (const t of [rules.levelTests?.support, rules.levelTests?.resistance]) {
    if (t && t.tests >= 2) lines.push({ text: `Price has tested ${px(t.level)} ${t.tests} times.` });
  }
  if (rules.yearFraction && rec.yearFraction) {
    lines.push({ text: `${rules.yearFraction.daysSincePivot} days since the last turn.`, note: recordNote(rec.yearFraction) });
  } else if (rules.dayCountBands?.length > 0 && rec.dayCountBands) {
    lines.push({ text: `${rules.dayCountBands[0].daysSincePivot} days since the last turn.`, note: recordNote(rec.dayCountBands) });
  }
  if (rules.barMidpoint) {
    lines.push({ text: `${rules.barMidpoint.upOfLast5} of the last 5 closes finished in the upper half of the day's range.` });
  }
  const rot = rules.ruleOfThree;
  for (const [tf, r] of [["weekly", rot?.weekly], ["monthly", rot?.monthly]] as const) {
    if (r?.bearishSignal) lines.push({ text: `Three ${tf} closes in a row lower.` });
    else if (r?.bullishSignal) lines.push({ text: `Three ${tf} closes in a row higher.` });
  }
  const rs = rules.extremes?.reverseSignal;
  if (rs?.signal) {
    lines.push({
      text: rs.rule === "reverseDay"
        ? `A reversal day points to a ${rs.signal}.`
        : `A ${rs.runDays}-day run was broken, pointing to a ${rs.signal}.`,
    });
  }
  const gaps = rules.extremes?.gaps;
  if (gaps?.exhaustGap) lines.push({ text: `A gap at the ${gaps.exhaustGap} looks like an exhaustion gap.` });
  if (gaps?.gapsInNewTerritory && gaps.gapsInNewTerritory.count >= 3) {
    lines.push({ text: `${gaps.gapsInNewTerritory.count} ${gaps.gapsInNewTerritory.direction} gaps into new ground.` });
  }
  if (gaps?.filledGapReversal) lines.push({ text: `A filled gap turned the short-term trend ${gaps.filledGapReversal}.` });
  if (rules.timing?.alternation?.mark && rec.turnTiming) {
    lines.push({ text: `${rules.timing.alternation.mark} days since the last turn.`, note: recordNote(rec.turnTiming) });
  }
  if (rules.seasonal && rec.seasonalCount) lines.push({ text: `A seasonal turning date: ${rules.seasonal.point.label}.`, note: recordNote(rec.seasonalCount) });
  if (rules.accumulation && rules.accumulation.weeks >= 2) {
    lines.push({ text: `Price has held in a range for ${rules.accumulation.weeks.toFixed(1)} weeks${rules.accumulation.breakout ? ` and broke ${rules.accumulation.breakout}` : ""}.` });
  }
  const lead = rules.leadership;
  if (lead?.bottomedFirst) lines.push({ text: "It bottomed before the market did." });
  else if (lead?.bottomedLate) lines.push({ text: "It bottomed after the market did." });
  else if (lead?.toppedFirst) lines.push({ text: "It topped before the market did." });
  if (rules.sharesPerPoint?.topWarning) {
    lines.push({ text: `Volume per point of move is ${rules.sharesPerPoint.ratio.toFixed(1)}× the prior leg, a warning sign near tops.` });
  }
  const tr = rules.timeRules;
  if (tr?.halt) lines.push({ text: `A ${tr.halt.days}-day pause at the ${tr.halt.at} near ${px(tr.halt.extreme)}.` });
  if (tr?.reactionWeek) {
    lines.push({ text: `The pullback is in its week ${tr.reactionWeek}${tr.reactionAbnormal ? ", longer than usual" : tr.reactionInZone ? ", inside the usual 2-3 weeks" : ""}.` });
  }
  for (const m of [rules.multipleTops?.top, rules.multipleTops?.bottom]) {
    if (m) lines.push({ text: `A ${m.tests >= 3 ? "triple" : "double"} ${m.kind} at ${px(m.level)}, ${m.state}.` });
  }
  if (rules.zone?.firstSignOfEnd) lines.push({ text: "The move shows a first sign of ending." });
  const fr = rules.firstRally;
  if (fr?.state === "firstRally") {
    lines.push({
      text: `The advance from the bear-market low is a first rally so far (topped ${fr.topMonth}${fr.volumeRatio !== null ? ` on ${fr.volumeRatio.toFixed(1)}× volume` : ""}).`,
      note: CONTEXT_NOTE,
    });
  } else if (fr?.state === "bullCampaign") {
    lines.push({ text: `A bull trend has run ${fr.advanceMonths} months from the ${fr.lowMonth} low.`, note: CONTEXT_NOTE });
  }
  if (rules.campaign?.equalCorrections) {
    lines.push({ text: "The last three pullbacks in the uptrend were nearly equal.", note: CONTEXT_NOTE });
  }
  const crb = rules.cycleRangeBreak;
  if (crb) {
    const onDate = crb.onCycleDate && rec.timeCycle;
    lines.push({
      text: `A ${crb.rangeDays}-day range broke down on ${crb.volumeRatio.toFixed(1)}× volume${onDate ? ", inside a timing window" : ""}.`,
      note: `${onDate ? `${recordNote(rec.timeCycle)} ` : ""}${CONTEXT_NOTE}`,
    });
  }
  // A-TIME-16 and the swing projection are dated forward claims, shown only with a measured record (CYC-47).
  const nextChange = rules.timing?.changeDates?.next;
  if (nextChange && rec.turnTiming) {
    lines.push({ text: `A possible ${nextChange.expect} around ${nextChange.date}.`, note: recordNote(rec.turnTiming) });
  }
  if (rules.timing?.projection && rec.swingProjection) {
    lines.push({ text: `A possible swing ${rules.timing.projection.kind} around ${rules.timing.projection.medianDate}.`, note: recordNote(rec.swingProjection) });
  }
  return lines;
}

function barPatternNote(s: SaraConfluenceResult): string {
  if (s.marketAdapterStatus === "unsupported") return UNSUPPORTED_NOTE;
  if (!s.scenarioId) return "No pattern is set up on the closed bars.";
  const agree = s.timeframeContinuity === "confirmed" ? "with the higher timeframes agreeing" : "without the higher timeframes agreeing yet";
  return `${PATTERN_GLOSSARY_TERM[s.scenarioId]} (${s.direction}), ${agree}.`;
}

/** The Context card's readings, as sentences. Null modules stay null. */
export function toPublicContext(levels: GannConfluenceResult | null | undefined, barPattern: SaraConfluenceResult | null | undefined): PublicContext {
  const levelsRead: (ContextRead & { lines: ContextLine[] }) | null = levels
    ? levels.marketAdapterStatus === "unsupported"
      ? { alignment: levels.alignment, note: UNSUPPORTED_NOTE, lines: [] }
      : { alignment: levels.alignment, note: null, lines: levelLines(levels) }
    : null;
  return {
    levels: levelsRead,
    barPattern: barPattern ? { alignment: barPattern.alignment, note: barPatternNote(barPattern) } : null,
  };
}
