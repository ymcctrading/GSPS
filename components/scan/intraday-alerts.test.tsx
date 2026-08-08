/**
 * Rendering tests for the intraday panel.
 *
 * The detection maths is unit-tested in lib/__tests__/intraday-scanner.test.ts.
 * What this file covers is the part the user actually reads: that a result is
 * never presented without its data timestamp and source, that a stale or
 * unreachable symbol is named rather than silently dropped, that the audit
 * trail can answer "why didn't this alert", and that the confidence score is
 * inspectable rather than a bare number.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntradayAlerts } from "./intraday-alerts";
import type { Alert, ScanOutput, SymbolAudit } from "@/lib/scanner/intraday";

const spyAlert: Alert = {
  symbol: "SPY",
  kind: "etf",
  type: "opening_momentum",
  direction: "up",
  triggerTime: "2026-08-07T15:33:00.000Z",
  dataTimestamp: "2026-08-07T15:17:00.000Z",
  dataAgeSeconds: 960,
  move: {
    basis: "prior_close",
    reference: 500,
    current: 504.5,
    absolute: 4.5,
    percent: 0.9,
    direction: "up",
  },
  vwap: 502.1,
  relativeVolume: 1.8,
  sessionVolume: 62_000_000,
  confidence: 75,
  confidenceFactors: [
    { label: "Opening range broken", passed: true, weight: 30, detail: "Price is 3.50 beyond the high." },
    { label: "Volume confirms", passed: false, weight: 25, detail: "1.8× of normal." },
  ],
  invalidation: 500,
  continuationPlan: {
    confirmation: "Wait for a bar to close above 504.50 rather than entering into the move.",
    invalidation: 500,
    firstTarget: 513.5,
    cancelIf: "Price closes back below VWAP at 502.10.",
  },
  pivotPlan: {
    confirmation: "The continuation thesis fails if price closes back below 500.00.",
    invalidation: 504.9,
    firstTarget: 502.1,
    cancelIf: "Price chops around VWAP without holding either side.",
  },
  whyThisAppeared:
    "SPY traded above the range it set in the first 15 minutes of the day, and the extra volume behind it says the move has participation.",
  whyNotEarlier:
    "This is reported now rather than earlier because the price feed for this symbol runs about 16 min behind.",
};

const quietAudit: SymbolAudit = {
  symbol: "MSFT",
  kind: "equity",
  outcome: "filtered",
  reason: "Too little has traded today for a move here to mean much, so it was skipped.",
  checks: [
    { name: "Data freshness", passed: true, detail: "Newest print is 16 min old (limit 20 min)." },
    { name: "Liquidity", passed: false, detail: "12K shares traded today (minimum 50K shares)." },
  ],
  dataTimestamp: "2026-08-07T15:17:00.000Z",
  dataAgeSeconds: 960,
  metrics: null,
};

function mockScan(overrides: Partial<ScanOutput & Record<string, unknown>> = {}) {
  const payload = {
    scannedAt: "2026-08-07T15:33:00.000Z",
    alerts: [spyAlert],
    audit: [
      {
        symbol: "SPY",
        kind: "etf" as const,
        outcome: "alerted" as const,
        reason: "1 signal qualified.",
        checks: [],
        dataTimestamp: "2026-08-07T15:17:00.000Z",
        dataAgeSeconds: 960,
        metrics: null,
      },
      quietAudit,
    ],
    staleSymbols: [],
    dataSource: "alpaca",
    dataIsLive: true,
    session: "Regular session",
    unreachable: [],
    ...overrides,
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) } as Response),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IntradayAlerts", () => {
  it("shows the move with the basis it was measured against", async () => {
    mockScan();
    render(<IntradayAlerts />);

    expect(await screen.findByText(/\+\$4\.50 \(0\.90%\)/)).toBeInTheDocument();
    expect(screen.getByText("from yesterday's close")).toBeInTheDocument();
  });

  it("stamps every result with when the data printed and where it came from", async () => {
    mockScan();
    render(<IntradayAlerts />);

    expect(await screen.findByText(/Scanned Aug 7, 2026 · 11:33 AM ET/)).toBeInTheDocument();
    expect(screen.getByText(/Source: alpaca/)).toBeInTheDocument();
    expect(screen.getByText("Regular session")).toBeInTheDocument();
  });

  it("says outright when a scan ran on demo data rather than live prices", async () => {
    mockScan({ dataSource: "synthetic", dataIsLive: false });
    render(<IntradayAlerts />);

    expect(await screen.findByText(/demo data — not live prices/)).toBeInTheDocument();
  });

  it("names symbols whose feed was stale instead of dropping them", async () => {
    mockScan({ alerts: [], staleSymbols: ["TSLA", "AMD"] });
    render(<IntradayAlerts />);

    expect(await screen.findByText(/Stale feed for TSLA, AMD/)).toBeInTheDocument();
  });

  it("names symbols that could not be fetched at all", async () => {
    mockScan({ alerts: [], unreachable: ["GOOGL"] });
    render(<IntradayAlerts />);

    expect(await screen.findByText(/No market data returned for GOOGL/)).toBeInTheDocument();
  });

  it("treats an empty result as an answer, not a failure", async () => {
    mockScan({ alerts: [] });
    render(<IntradayAlerts />);

    expect(await screen.findByText(/an empty list here is a result, not a failure/)).toBeInTheDocument();
  });

  it("labels asset classes so an ETF is not shown as a stock", async () => {
    mockScan();
    render(<IntradayAlerts />);

    expect(await screen.findByText("ETF")).toBeInTheDocument();
  });

  it("shows the confidence score broken into the factors that produced it", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    await user.click(await screen.findByRole("button", { name: /Show the plan/ }));

    expect(screen.getByText(/How the 75\/100 was reached/)).toBeInTheDocument();
    expect(screen.getByText(/Opening range broken/)).toBeInTheDocument();
    expect(screen.getByText(/\(25 pts\) — 1\.8× of normal\./)).toBeInTheDocument();
  });

  it("gives both a continuation plan and an opposite-direction pivot plan", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    await user.click(await screen.findByRole("button", { name: /Show the plan/ }));

    expect(screen.getByText("If it continues")).toBeInTheDocument();
    expect(screen.getByText("If it turns")).toBeInTheDocument();
    expect(screen.getByText(/Wait for a bar to close above 504\.50/)).toBeInTheDocument();
    expect(screen.getByText(/chops around VWAP/)).toBeInTheDocument();
  });

  it("explains a late detection when the move already happened", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    await user.click(await screen.findByRole("button", { name: /Show the plan/ }));

    expect(screen.getByText(/Why this wasn't flagged earlier/)).toBeInTheDocument();
    expect(screen.getByText(/runs about 16 min behind/)).toBeInTheDocument();
  });

  it("says it is educational rather than advice", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    await user.click(await screen.findByRole("button", { name: /Show the plan/ }));

    expect(screen.getByText(/not a recommendation/)).toBeInTheDocument();
  });

  it("answers 'why didn't this alert' for every symbol that was checked", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    const toggle = await screen.findByRole("button", { name: /Why each symbol did or didn't alert/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    expect(screen.getByText("Filtered out")).toBeInTheDocument();
    expect(screen.getByText(/Too little has traded today/)).toBeInTheDocument();
    // The individual checks, so a rejection points at the rule that made it.
    expect(screen.getByText(/12K shares traded today/)).toBeInTheDocument();
  });

  it("surfaces a failed scan rather than showing an empty panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          json: () => Promise.resolve({ error: "Market data unavailable" }),
        } as Response),
      ),
    );
    render(<IntradayAlerts />);

    expect(await screen.findByText("Market data unavailable")).toBeInTheDocument();
  });

  it("rescans against the server when asked", async () => {
    const user = userEvent.setup();
    mockScan();
    render(<IntradayAlerts />);

    await screen.findByText(/Scanned Aug 7, 2026/);
    const before = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Rescan" }));

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
  });

  it("scopes the scan to the symbols it was given", async () => {
    mockScan();
    render(<IntradayAlerts symbols={["SPY", "NVDA"]} />);

    await screen.findByText(/Scanned Aug 7, 2026/);
    const url = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("symbols=SPY%2CNVDA");
  });
});

describe("IntradayAlerts — reversal risk", () => {
  it("frames a failed breakout as a reason to stand aside, not to flip", async () => {
    mockScan({
      alerts: [
        {
          ...spyAlert,
          type: "reversal_risk",
          direction: "down",
          whyThisAppeared:
            "Price traded up through the opening-range high at 501.00 and has come back below it. The useful response is usually to stand aside rather than to flip.",
        },
      ],
    });
    render(<IntradayAlerts />);

    const card = (await screen.findByText("SPY")).closest("div.rounded-lg") as HTMLElement;
    expect(within(card).getByText(/Reversal risk/)).toBeInTheDocument();
    expect(within(card).getByText(/stand aside rather than to flip/)).toBeInTheDocument();
  });
});
