import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanReadingLine, resetPlanReadingCache } from "./plan-reading-line";
import { planFromLevels } from "@/lib/strategies/explain/params";

const PLAN = planFromLevels("buy", {
  entry: 100,
  stop: 95,
  tp1: 110,
  mtp: 120,
});

function mockFetch(mode: string, allowed: string[]) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/strategy-mode-preference")) {
      return new Response(JSON.stringify({ mode, allowedModes: allowed }));
    }
    return new Response(
      JSON.stringify({
        reading: {
          source: "rsiReversal",
          label: "RSI",
          agrees: true,
          summary: "RSI leans bullish, the same way as GSPS's plan.",
          levels: [
            {
              level: "entry",
              price: 100,
              text: "Entry $100.00: RSI would read 55.0.",
            },
          ],
        },
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetPlanReadingCache();
});

describe("PlanReadingLine", () => {
  it("reads GSPS's plan in the saved technique, on the execution timeframe", async () => {
    const fetchMock = mockFetch("rsiReversal", ["rsiReversal"]);
    render(<PlanReadingLine symbol="AAPL" plan={PLAN} />);
    expect(await screen.findByText(/leans bullish/)).toBeInTheDocument();
    const url = String(fetchMock.mock.calls[1][0]);
    expect(url).toContain("mode=rsiReversal");
    expect(url).toContain("timeframe=15Min");
    expect(url).toContain("entry=100");
    expect(url).toContain("stop=95");
    await userEvent.click(screen.getByRole("button", { name: "By level" }));
    expect(screen.getByText(/RSI would read 55.0/)).toBeInTheDocument();
  });

  it("shows nothing when the saved technique is GSPS's own plan", async () => {
    const fetchMock = mockFetch("gann", ["rsiReversal"]);
    const { container } = render(<PlanReadingLine symbol="AAPL" plan={PLAN} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing and asks nothing without a plan", () => {
    const fetchMock = mockFetch("rsiReversal", ["rsiReversal"]);
    const { container } = render(<PlanReadingLine symbol="AAPL" plan={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("planFromLevels", () => {
  it("returns null without an armed entry and stop", () => {
    expect(planFromLevels("buy", { entry: null, stop: 95 })).toBeNull();
    expect(planFromLevels("sell", { entry: 100, stop: 95 })).toBeNull();
  });
  it("drops a target on the wrong side", () => {
    expect(
      planFromLevels("sell", { entry: 100, stop: 105, tp1: 110, mtp: 90 }),
    ).toEqual({
      direction: "bearish",
      entry: 100,
      stopLoss: 105,
      takeProfit1: null,
      masterTarget: 90,
    });
  });
});
