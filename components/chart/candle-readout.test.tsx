/**
 * The readout panel's volume row is optional.
 *
 * Everything else the panel reports is the candle itself — take OHLC or the
 * range strip away and there is no panel left. Volume is a second reading laid
 * over the same bar, and a reader who does not trade on it should be able to
 * put it away, the same as extended-hours shading or the structural levels.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CandleReadoutPanel } from "./candle-readout";
import type { CandleReadout } from "@/lib/chart/readout";

const readout: CandleReadout = {
  time: 1786320000,
  open: 224.31,
  high: 224.65,
  low: 222.67,
  close: 224.0,
  volume: 475_800,
  extended: false,
  range: 1.98,
  bodyShare: 0.16,
  change: -0.31,
  changePct: -0.14,
  closePosition: 0.67,
  relVolume: 0.2,
  direction: "down",
};

describe("CandleReadoutPanel volume row", () => {
  it("is drawn by default", () => {
    render(<CandleReadoutPanel readout={readout} timeframeLabel="D" />);

    expect(screen.getByText("Vol")).toBeInTheDocument();
    expect(screen.getByText("0.2× avg")).toBeInTheDocument();
  });

  it("drops the row and its meter when switched off", () => {
    render(<CandleReadoutPanel readout={readout} timeframeLabel="D" showVolume={false} />);

    expect(screen.queryByText("Vol")).not.toBeInTheDocument();
    expect(screen.queryByText("0.2× avg")).not.toBeInTheDocument();
  });

  it("keeps the candle itself either way", () => {
    const { rerender } = render(
      <CandleReadoutPanel readout={readout} timeframeLabel="D" showVolume={false} />,
    );
    const price = () => screen.getByText("224.31");

    expect(price()).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();

    rerender(<CandleReadoutPanel readout={readout} timeframeLabel="D" showVolume />);
    expect(price()).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();
  });
});
