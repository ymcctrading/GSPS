/**
 * What a guided card must say before a user can tap it.
 *
 * This card replaces a score, a nine-row breakdown and four price levels with
 * two sentences and a button, so the things it is required to show are not a
 * matter of layout taste: the size, the dollar risk, the disclosure at the point
 * of the tap, and a way back to the full scan for anyone who wants to check the
 * work.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidedCard } from "./guided-card";
import { GUIDED_DISCLOSURE } from "@/lib/guided/config";
import type { Recommendation } from "@/lib/guided/service";

const rec: Recommendation = {
  id: "rec-1",
  symbol: "META",
  assetClass: "us_equity",
  action: "buy",
  currentPrice: 512.4,
  reason: "META has sold off into a price area that has stopped declines before.",
  qty: 24,
  notionalUsd: 12_297,
  riskUsd: 12,
  rewardUsd: 31,
  boundBy: "risk",
  riskRewardSentence:
    "You could lose about $12 if this doesn't work, or make about $31 if it reaches the target.",
  exitSentence: "If it works, 14 of the 24 shares are sold at the first target.",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  why: {
    score: {
      score: 8,
      max: 9,
      pillars: [
        { pillar: "trend", met: 2, total: 2 },
        { pillar: "structure", met: 3, total: 3 },
      ],
      stateNote: null,
    },
    verdict: "Execute",
    entry: 512.5,
    stopLoss: 508,
    takeProfit1: 519.25,
    masterProfit: 523.75,
    trend: "monthly rising, weekly rising, daily falling",
    patternName: "2-1-2",
    tickerHref: "/ticker/META",
    signal: null,
  },
};

const noop = () => {};

describe("GuidedCard", () => {
  it("leads with the action and the size, not with the levels", () => {
    render(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy={false} />);

    expect(screen.getByText("META")).toBeInTheDocument();
    expect(screen.getByText(/24 shares/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy 24 META/ })).toBeInTheDocument();
    // The plan is behind "Why this one?", not on the face of the card.
    expect(screen.queryByText("$508.00")).not.toBeInTheDocument();
  });

  it("states the real dollar risk and reward", () => {
    render(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy={false} />);
    expect(screen.getByText(/lose about \$12/)).toBeInTheDocument();
    expect(screen.getByText(/make about \$31/)).toBeInTheDocument();
  });

  it("shows the disclosure on the card itself, not behind a link", () => {
    render(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy={false} />);
    expect(screen.getByText(GUIDED_DISCLOSURE)).toBeInTheDocument();
  });

  it("expands into the score rollup and the levels on request", async () => {
    const user = userEvent.setup();
    render(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy={false} />);

    await user.click(screen.getByRole("button", { name: /Why this one/ }));

    expect(screen.getByText("8 of 9")).toBeInTheDocument();
    expect(screen.getByText("$508.00")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the full scan/ })).toHaveAttribute(
      "href",
      "/ticker/META",
    );
  });

  it("asks for confirmation rather than placing the order itself", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<GuidedCard rec={rec} onConfirm={onConfirm} onDismiss={noop} busy={false} />);

    await user.click(screen.getByRole("button", { name: /Buy 24 META/ }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables both actions while an order is in flight", () => {
    render(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy />);
    expect(screen.getByRole("button", { name: /Buy 24 META/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
  });

  it("never says Buy for a short", () => {
    const shortRec: Recommendation = {
      ...rec,
      action: "sell",
      symbol: "ONDS",
      why: { ...rec.why, entry: 12.5, stopLoss: 13.2, takeProfit1: 11.45, masterProfit: 10.75 },
    };
    render(<GuidedCard rec={shortRec} onConfirm={noop} onDismiss={noop} busy={false} />);

    expect(screen.getByRole("button", { name: /Sell short 24 ONDS/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Buy/ })).not.toBeInTheDocument();
    // The badge says it too, not only the button.
    expect(screen.getAllByText(/Sell short/).length).toBeGreaterThan(1);
  });

  it("explains a budget-capped size, and stays quiet when the risk math decided it", () => {
    const { rerender } = render(
      <GuidedCard rec={{ ...rec, boundBy: "budget" }} onConfirm={noop} onDismiss={noop} busy={false} />,
    );
    expect(screen.getByText(/Capped to your per-trade dollar budget/)).toBeInTheDocument();

    rerender(<GuidedCard rec={rec} onConfirm={noop} onDismiss={noop} busy={false} />);
    expect(screen.queryByText(/Capped to your per-trade dollar budget/)).not.toBeInTheDocument();
  });
});
