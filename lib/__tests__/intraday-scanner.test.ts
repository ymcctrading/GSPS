import { describe, it, expect } from "vitest";
import type { Bar } from "@/lib/types";
import {
  DEFAULT_CONFIG,
  cooldownUntil,
  measureMove,
  scanIntraday,
  barsForSession,
  scoreConfidence,
  sessionMetrics,
  volumeBaseline,
  type ScannerConfig,
  type SymbolInput,
} from "@/lib/scanner/intraday";

/**
 * The session these tests replay is 2026-08-07, the day the scanner was
 * reported to have missed a $3–5 move in SPY inside the first two hours. Bars
 * are built in Eastern time so the opening-range window lands where the real
 * session boundary is: 13:30Z is 09:30 ET on that date.
 */
const OPEN_UTC = Date.parse("2026-08-07T13:30:00Z");

function bar(minuteOffset: number, o: number, h: number, l: number, c: number, v = 1_000_000): Bar {
  return {
    t: new Date(OPEN_UTC + minuteOffset * 60_000).toISOString(),
    o,
    h,
    l,
    c,
    v,
  };
}

/** A session that opens flat, ranges for 15 minutes, then trends up $4. */
function trendingUpBars(): Bar[] {
  const bars: Bar[] = [];
  // Opening range: 15 one-minute bars between 500 and 501.
  for (let i = 0; i < 15; i++) bars.push(bar(i, 500.2, 501, 500, 500.6));
  // The run: 90 minutes climbing to 504.5, each bar higher than the last.
  for (let i = 15; i < 105; i++) {
    const base = 500.6 + ((i - 15) / 90) * 3.9;
    bars.push(bar(i, base, base + 0.25, base - 0.1, base + 0.2, 1_200_000));
  }
  return bars;
}

function input(overrides: Partial<SymbolInput> = {}): SymbolInput {
  const bars = overrides.bars ?? trendingUpBars();
  const last = bars[bars.length - 1];
  return {
    symbol: "SPY",
    kind: "etf",
    bars,
    barIntervalMinutes: 1,
    prevClose: 500,
    quote: last ? { price: last.c, at: last.t } : null,
    volumeBaseline: 80_000_000,
    dailyAtr: 2.5,
    ...overrides,
  };
}

/** 11:33 ET on 2026-08-07 — the moment the move was reported as unflagged. */
const AT_1133 = new Date("2026-08-07T15:33:00Z");

describe("sessionMetrics", () => {
  it("derives the opening range from bar timestamps, not bar count", () => {
    const m = sessionMetrics(input(), DEFAULT_CONFIG)!;
    expect(m.openingRangeComplete).toBe(true);
    expect(m.openingRangeHigh).toBeCloseTo(501, 5);
    expect(m.openingRangeLow).toBeCloseTo(500, 5);
  });

  it("reports the range as incomplete before it has finished forming", () => {
    const partial = trendingUpBars().slice(0, 8);
    const m = sessionMetrics(input({ bars: partial }), DEFAULT_CONFIG)!;
    expect(m.openingRangeComplete).toBe(false);
  });

  it("computes VWAP from typical price, so a bar closing at its extreme doesn't dominate", () => {
    const bars = [bar(0, 100, 110, 90, 110, 1000), bar(1, 110, 110, 110, 110, 1000)];
    const m = sessionMetrics(input({ bars, prevClose: 100 }), DEFAULT_CONFIG)!;
    // Typical prices are (110+90+110)/3 = 103.33 and 110, equally weighted.
    expect(m.vwap).toBeCloseTo(106.67, 1);
  });

  it("leaves relative volume null rather than defaulting it to 1.0", () => {
    const m = sessionMetrics(input({ volumeBaseline: null }), DEFAULT_CONFIG)!;
    expect(m.relativeVolume).toBeNull();
  });

  it("discards bad prints instead of letting them set the session range", () => {
    const bars = [...trendingUpBars(), bar(106, 0, 0, 0, 0, 5000)];
    const m = sessionMetrics(input({ bars }), DEFAULT_CONFIG)!;
    expect(m.low).toBeGreaterThan(400);
  });

  it("returns null when no usable bar arrived at all", () => {
    expect(sessionMetrics(input({ bars: [] }), DEFAULT_CONFIG)).toBeNull();
  });
});

describe("measureMove", () => {
  it("states the basis alongside the number", () => {
    const move = measureMove(504.5, 500, "prior_close")!;
    expect(move.basis).toBe("prior_close");
    expect(move.absolute).toBeCloseTo(4.5, 5);
    expect(move.percent).toBeCloseTo(0.9, 5);
    expect(move.direction).toBe("up");
  });

  it("measures a down move as negative", () => {
    const move = measureMove(495, 500, "session_open")!;
    expect(move.absolute).toBeCloseTo(-5, 5);
    expect(move.direction).toBe("down");
  });

  it("refuses to divide by a non-positive reference", () => {
    expect(measureMove(100, 0, "prior_close")).toBeNull();
    expect(measureMove(100, -5, "prior_close")).toBeNull();
  });
});

describe("scanIntraday — the reported SPY miss", () => {
  it("flags a $4.50 SPY move that the daily reversion scan cannot see", () => {
    const { alerts } = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);

    expect(alerts.length).toBeGreaterThan(0);
    const types = alerts.map((a) => a.type);
    expect(types).toContain("opening_momentum");
    expect(types).toContain("trend_continuation");
    expect(alerts.every((a) => a.symbol === "SPY")).toBe(true);
  });

  it("reports the move against an explicit, named basis", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find(
      (a) => a.type === "volatility_expansion",
    )!;
    expect(alert.move.basis).toBe("prior_close");
    expect(alert.move.reference).toBe(500);
    expect(alert.move.absolute).toBeGreaterThan(3);
  });

  it("carries an invalidation level on every alert", () => {
    const { alerts } = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    expect(alerts.every((a) => a.invalidation !== null)).toBe(true);
  });

  it("gives both a continuation plan and an opposite-direction pivot plan", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.continuationPlan.confirmation).toBeTruthy();
    expect(alert.continuationPlan.cancelIf).toBeTruthy();
    expect(alert.pivotPlan.confirmation).toContain("needs its own evidence");
    expect(alert.pivotPlan.cancelIf).toContain("standing aside");
  });

  it("explains itself in plain language, without predicting", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.whyThisAppeared.length).toBeGreaterThan(80);
    expect(alert.whyThisAppeared).not.toMatch(/will (rise|fall|go|continue)/i);
    expect(alert.whyThisAppeared).not.toMatch(/guarantee/i);
  });

  it("shows the confidence score's factors, not just the number", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.confidence).toBeGreaterThan(0);
    expect(alert.confidence).toBeLessThanOrEqual(100);
    expect(alert.confidenceFactors.length).toBeGreaterThan(1);
    expect(alert.confidenceFactors.every((f) => f.detail.length > 0)).toBe(true);
  });
});

describe("scanIntraday — data freshness", () => {
  it("refuses to alert on a stale feed and says so", () => {
    // Bars end at 11:15 ET but the scan runs at 15:33 ET — four hours behind.
    const late = new Date("2026-08-07T19:33:00Z");
    const output = scanIntraday([input()], DEFAULT_CONFIG, late);

    expect(output.alerts).toHaveLength(0);
    expect(output.staleSymbols).toEqual(["SPY"]);
    expect(output.audit[0].outcome).toBe("stale_data");
    expect(output.audit[0].reason).toMatch(/old/);
  });

  it("records the data timestamp separately from the trigger time", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts[0];
    expect(alert.triggerTime).toBe(AT_1133.toISOString());
    expect(alert.dataTimestamp).not.toBe(alert.triggerTime);
    expect(alert.dataAgeSeconds).toBeGreaterThan(0);
  });

  it("explains a late detection in terms of the feed delay and the opening range", () => {
    const alert = scanIntraday([input()], DEFAULT_CONFIG, AT_1133).alerts.find(
      (a) => a.type === "opening_momentum",
    )!;
    expect(alert.whyNotEarlier).toContain("opening range");
  });
});

describe("scanIntraday — thresholds scale with the symbol", () => {
  it("does not call a $3 move in a $600 name an expansion when its range is $12", () => {
    const bars = trendingUpBars();
    const output = scanIntraday(
      [input({ bars, prevClose: 500, dailyAtr: 12 })],
      DEFAULT_CONFIG,
      AT_1133,
    );
    expect(output.alerts.map((a) => a.type)).not.toContain("volatility_expansion");
  });

  it("does call the same dollar move an expansion when the symbol's range is small", () => {
    const output = scanIntraday(
      [input({ dailyAtr: 1.2 })],
      DEFAULT_CONFIG,
      AT_1133,
    );
    expect(output.alerts.map((a) => a.type)).toContain("volatility_expansion");
  });

  it("skips a symbol with too little volume to be worth calling", () => {
    const thin = trendingUpBars().map((b) => ({ ...b, v: 10 }));
    const output = scanIntraday([input({ bars: thin })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts).toHaveLength(0);
    expect(output.audit[0].outcome).toBe("filtered");
  });
});

describe("scanIntraday — reversal risk", () => {
  it("flags a breakout that was given back", () => {
    const bars = trendingUpBars();
    // Round-trip: the last twenty minutes give the whole move back and close
    // below the opening-range high.
    for (let i = 105; i < 125; i++) {
      const base = 504.5 - ((i - 105) / 20) * 4.6;
      bars.push(bar(i, base, base + 0.1, base - 0.25, base - 0.2, 2_000_000));
    }
    const last = bars[bars.length - 1];
    const output = scanIntraday(
      [input({ bars, quote: { price: last.c, at: last.t } })],
      DEFAULT_CONFIG,
      new Date("2026-08-07T15:40:00Z"),
    );

    const reversal = output.alerts.find((a) => a.type === "reversal_risk");
    expect(reversal).toBeDefined();
    expect(reversal!.direction).toBe("down");
    expect(reversal!.whyThisAppeared).toContain("stand aside");
  });
});

describe("scanIntraday — suppression", () => {
  const recent = [
    { type: "opening_momentum" as const, direction: "up" as const, at: "2026-08-07T15:20:00Z" },
  ];

  it("suppresses a repeat of the same signal inside the cooldown", () => {
    const output = scanIntraday([input({ lastAlerts: recent })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.map((a) => a.type)).not.toContain("opening_momentum");
  });

  it("records the suppression in the audit rather than looking like no signal", () => {
    const output = scanIntraday([input({ lastAlerts: recent })], DEFAULT_CONFIG, AT_1133);
    const suppression = output.audit[0].checks.find((c) => c.name.includes("suppression"));
    expect(suppression).toBeDefined();
    expect(suppression!.detail).toContain("suppressed until");
  });

  it("never lets a momentum alert silence a reversal alert on the same symbol", () => {
    const until = cooldownUntil(
      input({ lastAlerts: recent }),
      { type: "reversal_risk", direction: "down" },
      DEFAULT_CONFIG,
    );
    expect(until).toBeNull();
  });

  it("lets the same signal through once the cooldown has expired", () => {
    const old = [
      { type: "opening_momentum" as const, direction: "up" as const, at: "2026-08-07T14:00:00Z" },
    ];
    const output = scanIntraday([input({ lastAlerts: old })], DEFAULT_CONFIG, AT_1133);
    expect(output.alerts.map((a) => a.type)).toContain("opening_momentum");
  });
});

describe("scanIntraday — audit trail", () => {
  it("records an entry for every symbol, including those that produced nothing", () => {
    const flat = Array.from({ length: 105 }, (_, i) => bar(i, 500, 500.1, 499.9, 500, 1_000_000));
    const output = scanIntraday(
      [
        input(),
        input({
          symbol: "MSFT",
          kind: "equity",
          bars: flat,
          quote: { price: 500, at: flat[flat.length - 1].t },
        }),
      ],
      DEFAULT_CONFIG,
      AT_1133,
    );

    expect(output.audit.map((a) => a.symbol).sort()).toEqual(["MSFT", "SPY"]);
    const msft = output.audit.find((a) => a.symbol === "MSFT")!;
    expect(msft.outcome).toBe("no_signal");
    expect(msft.reason).toContain("Evaluated");
  });

  it("names each check it ran, passed or failed", () => {
    const output = scanIntraday([input()], DEFAULT_CONFIG, AT_1133);
    const names = output.audit[0].checks.map((c) => c.name);
    expect(names).toContain("Data freshness");
    expect(names).toContain("Liquidity");
    expect(names).toContain("Reference price");
  });

  it("distinguishes 'no data arrived' from 'evaluated and nothing qualified'", () => {
    const output = scanIntraday([input({ bars: [] })], DEFAULT_CONFIG, AT_1133);
    expect(output.audit[0].outcome).toBe("insufficient_data");
  });

  it("keeps asset kinds labeled so an ETF is not presented as a stock", () => {
    const output = scanIntraday(
      [input(), input({ symbol: "BTC/USD", kind: "crypto" })],
      DEFAULT_CONFIG,
      AT_1133,
    );
    expect(output.audit.find((a) => a.symbol === "SPY")!.kind).toBe("etf");
    expect(output.audit.find((a) => a.symbol === "BTC/USD")!.kind).toBe("crypto");
  });
});

describe("scoreConfidence", () => {
  it("is the share of available weight that was earned", () => {
    expect(
      scoreConfidence([
        { label: "a", passed: true, weight: 30, detail: "" },
        { label: "b", passed: false, weight: 10, detail: "" },
      ]),
    ).toBe(75);
  });

  it("is zero when nothing passed and 100 when everything did", () => {
    const factors = [
      { label: "a", weight: 30, detail: "" },
      { label: "b", weight: 70, detail: "" },
    ];
    expect(scoreConfidence(factors.map((f) => ({ ...f, passed: false })))).toBe(0);
    expect(scoreConfidence(factors.map((f) => ({ ...f, passed: true })))).toBe(100);
  });

  it("does not divide by zero on an empty factor list", () => {
    expect(scoreConfidence([])).toBe(0);
  });
});

describe("configuration", () => {
  it("scales detection with a caller-supplied config rather than hard-coded numbers", () => {
    const strict: ScannerConfig = { ...DEFAULT_CONFIG, unusualVolumeThreshold: 99 };
    const loose: ScannerConfig = { ...DEFAULT_CONFIG, unusualVolumeThreshold: 0.5 };

    expect(scanIntraday([input()], strict, AT_1133).alerts.map((a) => a.type)).not.toContain(
      "unusual_volume",
    );
    expect(scanIntraday([input()], loose, AT_1133).alerts.map((a) => a.type)).toContain(
      "unusual_volume",
    );
  });
});

describe("volumeBaseline", () => {
  /** Two minutes of volume per session, on three consecutive weekdays. */
  function sessionBars(date: string, perBar: number): Bar[] {
    const open = Date.parse(`${date}T13:30:00Z`);
    return Array.from({ length: 60 }, (_, i) => ({
      t: new Date(open + i * 60_000).toISOString(),
      o: 100,
      h: 100.1,
      l: 99.9,
      c: 100,
      v: perBar,
    }));
  }

  const history = [
    ...sessionBars("2026-08-05", 1000),
    ...sessionBars("2026-08-06", 3000),
    ...sessionBars("2026-08-07", 9999), // today — must be excluded
  ];

  it("averages prior sessions' volume up to the same time of day", () => {
    // 10:00 ET is 30 minutes into the session. The bar stamped 10:00 counts:
    // a bar's timestamp is its start, and today's cumulative volume includes
    // the bar currently in progress, so the baseline has to include the same
    // one or relative volume is biased high by a bar on every scan.
    const at1000 = 10 * 60;
    expect(volumeBaseline(history, at1000, "2026-08-07")).toBe((31 * 1000 + 31 * 3000) / 2);
  });

  it("excludes today, so the baseline is never measured against itself", () => {
    const baseline = volumeBaseline(history, 10 * 60, "2026-08-07")!;
    expect(baseline).toBeLessThan(30 * 9999);
  });

  // A whole-day average would make every symbol look quiet in the morning,
  // which is exactly the window the reported move happened in.
  it("scales with the time of day rather than using a whole-session figure", () => {
    const early = volumeBaseline(history, 9 * 60 + 45, "2026-08-07")!;
    const late = volumeBaseline(history, 10 * 60 + 30, "2026-08-07")!;
    expect(late).toBeGreaterThan(early);
  });

  it("returns null rather than a number drawn from a single session", () => {
    expect(volumeBaseline(sessionBars("2026-08-06", 3000), 10 * 60, "2026-08-07")).toBeNull();
  });

  it("returns null when there is no history at all", () => {
    expect(volumeBaseline([], 10 * 60, "2026-08-07")).toBeNull();
  });
});

describe("barsForSession", () => {
  it("keeps only the requested Eastern date and sorts it oldest first", () => {
    const bars = [
      { t: "2026-08-07T19:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: "2026-08-06T19:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
      { t: "2026-08-07T13:31:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 },
    ];
    const session = barsForSession(bars, "2026-08-07");
    expect(session.map((b) => b.t)).toEqual([
      "2026-08-07T13:31:00Z",
      "2026-08-07T19:00:00Z",
    ]);
  });

  // 2026-08-08T01:00Z is still 2026-08-07 in New York — an after-hours print
  // belongs to the session it traded in, not to the next UTC day.
  it("groups a late-evening UTC print into the Eastern session it belongs to", () => {
    const bars = [{ t: "2026-08-08T01:00:00Z", o: 1, h: 1, l: 1, c: 1, v: 1 }];
    expect(barsForSession(bars, "2026-08-07")).toHaveLength(1);
  });
});

describe("session boundaries", () => {
  /** A bar at a given ET wall-clock minute on 2026-08-07. */
  function etBar(hour: number, minute: number, price: number, v = 1_000_000): Bar {
    // 2026-08-07 is EDT (UTC-4), so ET hour + 4 is the UTC hour.
    const t = new Date(Date.UTC(2026, 7, 7, hour + 4, minute)).toISOString();
    return { t, o: price, h: price + 0.1, l: price - 0.1, c: price, v };
  }

  // The feed serves pre-market from 04:00 ET. Anchoring the opening range on
  // "the first bar of the day" put it in the pre-market, where a few thin
  // prints set a range two cents wide that everything then "broke out" of at
  // 09:30 — turning the detector into a clock.
  it("ignores pre-market bars when setting the opening range", () => {
    const bars = [
      etBar(4, 0, 400),
      etBar(4, 5, 401),
      etBar(4, 10, 402),
      etBar(9, 30, 500),
      etBar(9, 40, 501),
      etBar(9, 50, 502),
      etBar(10, 0, 503),
    ];
    const m = sessionMetrics(input({ bars, kind: "etf" }), DEFAULT_CONFIG)!;

    // The range is 09:30–09:45, so the 09:30 and 09:40 bars are in it and the
    // three pre-market bars are not — a range anchored on the first bar of the
    // day would have been 400–402.
    expect(m.openingRangeHigh).toBeCloseTo(501.1, 5);
    expect(m.openingRangeLow).toBeCloseTo(499.9, 5);
    // And the pre-market prints are not in the session high/low either.
    expect(m.low).toBeGreaterThan(490);
  });

  it("excludes pre-market volume from the session total", () => {
    const bars = [etBar(4, 0, 400, 5_000_000), etBar(9, 30, 500, 1_000_000)];
    const m = sessionMetrics(input({ bars }), DEFAULT_CONFIG)!;
    expect(m.cumulativeVolume).toBe(1_000_000);
  });

  it("excludes after-hours bars too", () => {
    const bars = [etBar(9, 30, 500), etBar(15, 59, 501), etBar(17, 0, 520)];
    const m = sessionMetrics(input({ bars }), DEFAULT_CONFIG)!;
    expect(m.high).toBeLessThan(510);
  });

  it("anchors the range at 09:30 even when that bar is missing from the feed", () => {
    const bars = [etBar(9, 42, 500), etBar(9, 50, 505), etBar(10, 0, 510)];
    const m = sessionMetrics(input({ bars }), DEFAULT_CONFIG)!;
    // Range is 09:30–09:45, so only the 09:42 bar falls inside it — the window
    // does not slide forward to start at the first bar that happened to arrive.
    expect(m.openingRangeHigh).toBeCloseTo(500.1, 5);
  });

  it("treats the whole day as the session for crypto, which has no open", () => {
    const bars = [etBar(2, 0, 100), etBar(2, 30, 101), etBar(20, 0, 102)];
    const m = sessionMetrics(input({ bars, kind: "crypto", symbol: "BTC/USD" }), DEFAULT_CONFIG)!;
    expect(m.barCount).toBe(3);
    expect(m.openingRangeHigh).toBeCloseTo(100.1, 5);
  });

  it("returns null when a symbol traded only outside the regular session", () => {
    expect(sessionMetrics(input({ bars: [etBar(4, 0, 400)] }), DEFAULT_CONFIG)).toBeNull();
  });
});
