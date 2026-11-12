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

  it("glosses for a visitor, outside any member's shell", () => {
    render(<Term id="mtp" />);
    expect(screen.getByText("Master target (MTP)")).toBeInTheDocument();
  });
});
