/**
 * No confidential rule name in what a browser receives (AGENTS.md
 * "Confidential sources"; audit 2026-11-09). These are the ids and strings
 * that leave the server as API fields and values or as rendered copy: the
 * intraday signal ids and their labels, the intraday API's stored-row reads,
 * the timing records a client component imports, and the backtest API's exit
 * rule names. The built bundle is checked by scripts/check-bundle-terms.mjs
 * with the same list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CONFIDENTIAL_NAME_PATTERNS, confidentialNamesIn } from "@/lib/security/confidentialNames";
import { SIGNAL_DESCRIPTIONS, SIGNAL_LABELS } from "@/lib/scanner/intradayDisplay";
import { PLAIN_SIGNAL_LABELS } from "@/lib/reports/eveningReport";
import { storedIdsFor, storedSignalType } from "@/lib/scanner/storedSignalIds";
import { SHOWN_TIME_RECORDS } from "@/lib/timing/shownRecords";
import { TIME_LINE_RECORDS } from "@/lib/gann/timeRecords";
import { PUBLIC_EXIT_RULE_NAMES, exitRuleFromPublicName } from "@/lib/backtest/publicExitNames";
import { GANN_EXIT_RULE_NAMES } from "@/lib/gann/exitRules";
import { signalHashFor } from "@/lib/notifications/intradayDelivery";
import type { SignalType } from "@/lib/scanner/intraday";

describe("the pattern list", () => {
  it("catches every spelling of a named rule", () => {
    for (const s of ["squareOf52", "square_of_9", "Square of Nine", "overnight_turn", "OvernightChart", "space_overbalance", "seven-zones", "ruleOfThree", "three_adverse_closes", "boiling_point", "threeDayChart"]) {
      expect(confidentialNamesIn(s), s).not.toEqual([]);
    }
  });

  it("leaves plain trading words alone", () => {
    for (const s of ["pullback_record", "daily_swing_turn", "early_adverse_closes", "long_run_trail", "square of the range", "round number", "Daily swing turned"]) {
      expect(confidentialNamesIn(s), s).toEqual([]);
    }
  });

  it("matches the bundle check's list", () => {
    const script = readFileSync(join(process.cwd(), "scripts/check-bundle-terms.mjs"), "utf8");
    for (const p of CONFIDENTIAL_NAME_PATTERNS) expect(script, p.source).toContain(p.source);
  });
});

describe("intraday signals", () => {
  const types = Object.keys(SIGNAL_LABELS) as SignalType[];

  it("ids, labels and descriptions name no source or rule", () => {
    const shipped = JSON.stringify({ types, SIGNAL_LABELS, SIGNAL_DESCRIPTIONS, PLAIN_SIGNAL_LABELS });
    expect(confidentialNamesIn(shipped)).toEqual([]);
  });

  it("a row stored under an old id is answered with its new id", () => {
    expect(storedSignalType("space_overbalance")).toBe("pullback_record");
    expect(storedSignalType("overnight_turn")).toBe("daily_swing_turn");
    for (const t of types) expect(storedSignalType(t)).toBe(t);
    // What the recent-alerts API sends back for old rows.
    const response = JSON.stringify(["space_overbalance", "overnight_turn", ...types].map((id) => ({ type: storedSignalType(id) })));
    expect(confidentialNamesIn(response)).toEqual([]);
  });

  it("the push dedupe still finds a send logged under the old id", () => {
    expect(storedIdsFor("pullback_record")).toEqual(["pullback_record", "space_overbalance"]);
    expect(storedIdsFor("daily_swing_turn")).toEqual(["daily_swing_turn", "overnight_turn"]);
    expect(storedIdsFor("hourly_turn")).toEqual(["hourly_turn"]);
    expect(signalHashFor({ symbol: "SPY", type: "pullback_record", direction: "up" })).toBe("SPY-pullback_record-bullish");
  });

  it("the migration rewrites both tables and the push log", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0145_neutral_intraday_signal_ids.sql"), "utf8");
    for (const table of ["public.intraday_alerts", "public.intraday_system_alerts", "public.notification_log"]) expect(sql).toContain(`update ${table}`);
    expect(sql).toContain("'pullback_record'");
    expect(sql).toContain("'daily_swing_turn'");
  });
});

describe("timing records a client imports", () => {
  it("name no rule", () => {
    expect(confidentialNamesIn(JSON.stringify(SHOWN_TIME_RECORDS))).toEqual([]);
  });

  it("match the server's records for the same two badges", () => {
    expect(SHOWN_TIME_RECORDS.timing?.summary ?? null).toBe(TIME_LINE_RECORDS.timeCycle?.summary ?? null);
    expect(SHOWN_TIME_RECORDS.longTermTiming?.summary ?? null).toBe(TIME_LINE_RECORDS.yearCycles?.summary ?? null);
  });
});

describe("backtest API exit rule names", () => {
  it("name no rule, and map one to one onto the replay's rules", () => {
    expect(confidentialNamesIn(PUBLIC_EXIT_RULE_NAMES.join(","))).toEqual([]);
    expect(new Set(PUBLIC_EXIT_RULE_NAMES).size).toBe(GANN_EXIT_RULE_NAMES.length);
    for (const name of PUBLIC_EXIT_RULE_NAMES) expect(exitRuleFromPublicName(name)).not.toBeNull();
  });

  it("refuses an internal name that has a public one", () => {
    expect(exitRuleFromPublicName("three_adverse_closes")).toBeNull();
    expect(exitRuleFromPublicName("boiling_point")).toBeNull();
    expect(exitRuleFromPublicName("early_adverse_closes")).toBe("three_adverse_closes");
    expect(exitRuleFromPublicName("prior_week")).toBe("prior_week");
  });
});
