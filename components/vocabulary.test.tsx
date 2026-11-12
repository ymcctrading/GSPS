import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Term, VocabularyProvider } from "@/components/vocabulary";
import { TradeCards } from "@/components/dashboard/trade-cards";
import type { TradeCards as TradeCardsData } from "@/lib/cards/readCards";

const data = {
  cards: [{ kind: "edgeBottom", symbol: "AAPL", label: "Swing bottom", entry: 101, stop: 97, tp1: 109, tp2: null, mtp: null }],
  kinds: [],
  unchosen: [],
  heldBack: 0,
  signalDate: "2026-11-11",
} as unknown as TradeCardsData;

describe("trading vocabulary by the member's tier", () => {
  it("shows the trade card's entry as 'Entry (buy stop)' to a Novice, where the school teaches it", () => {
    render(
      <VocabularyProvider tier="PRACTICE">
        <TradeCards data={data} />
      </VocabularyProvider>,
    );
    expect(screen.getByText(/Entry \(buy stop\) \$101\.00/)).toBeInTheDocument();
    expect(screen.getByText(/First target \(TP1\) \$109\.00/)).toBeInTheDocument();
  });

  it("uses 'Buy stop' plainly from the next tier on", () => {
    render(
      <VocabularyProvider tier="STANDARD">
        <TradeCards data={data} />
      </VocabularyProvider>,
    );
    expect(screen.getByText(/Buy stop \$101\.00 · Stop loss \$97\.00 · TP1 \$109\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/Entry \(buy stop\)/)).toBeNull();
  });

  it("shows a range-low card as a buy at the open and a breakout as a labelled buy-limit alert", () => {
    const range = {
      ...data,
      cards: [
        { kind: "rangeLow", symbol: "LLL", label: "Range-low retest", entry: 93, stop: 85.5, tp1: 104, tp2: null, mtp: 120, grade: "setup", order: "buyAtOpen" },
        { kind: "rangeBreakout", symbol: "BBB", label: "Range breakout, higher-risk alert", entry: 102.5, stop: 96, tp1: 110, tp2: null, mtp: null, grade: "alert", order: "buyLimit" },
      ],
      alertsHeldBack: 0,
    } as unknown as TradeCardsData;
    render(
      <VocabularyProvider tier="PRACTICE">
        <TradeCards data={range} />
      </VocabularyProvider>,
    );
    expect(screen.getByText(/Entry \(buy at the open, a market order\) \(last close \$93\.00\)/)).toBeInTheDocument();
    expect(screen.getByText(/Entry \(buy limit\) \$102\.50/)).toBeInTheDocument();
    expect(screen.getAllByText("Higher-risk alert · not a verified setup")).toHaveLength(1);
  });

  it("tells a lower tier which tiers carry the breakout alerts", () => {
    render(
      <VocabularyProvider tier="STANDARD">
        <TradeCards data={{ ...data, cards: [], heldBack: 2, alertsHeldBack: 2, kinds: [{ kind: "rangeLow", label: "Range-low retest", heldOut: { summary: "x" }, forward: { calls: 0 }, since: null }] } as unknown as TradeCardsData} />
      </VocabularyProvider>,
    );
    expect(screen.getByText(/2 higher-risk breakout alerts for the next session come with Expert and Wall Street/)).toBeInTheDocument();
    expect(screen.getByText("No card on your plan for the next session.")).toBeInTheDocument();
    expect(screen.queryByText(/Pro plan and above/)).toBeNull();
  });

  it("glosses for a visitor, outside any member's shell", () => {
    render(<Term id="mtp" />);
    expect(screen.getByText("Master target (MTP)")).toBeInTheDocument();
  });
});
