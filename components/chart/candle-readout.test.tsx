/**
 * What the per-candle stat panel says, and in what order.
 *
 * The reading order is the point of the layout, not an accident of it: open and
 * close decide whether the bar went up or down and belong on the same line,
 * with the high and low that describe the stretch beneath them. Conventional
 * OHLC splits that pair across two lines. A test on the rendered order is the
 * only thing that stops the grid drifting back — the four fields render
 * correctly in any order, so nothing else would fail.
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

/** The price grid's labels, in the order they are rendered. */
function priceLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("span"))
    .map((el) => el.textContent ?? "")
    .filter((text) => /^[OCHL]$/.test(text));
}

describe("CandleReadoutPanel", () => {
  it("reads open, close, high, low", () => {
    const { container } = render(<CandleReadoutPanel readout={readout} timeframeLabel="D" />);

    expect(priceLabels(container)).toEqual(["O", "C", "H", "L"]);
  });

  it("puts each label against its own price", () => {
    render(<CandleReadoutPanel readout={readout} timeframeLabel="D" />);

    // Reordering the grid is a two-line edit that can easily move a label
    // without its value; these pin the pairing rather than the sequence.
    for (const [label, value] of [
      ["O", "224.31"],
      ["C", "224.00"],
      ["H", "224.65"],
      ["L", "222.67"],
    ]) {
      const field = screen.getByText(label).parentElement;
      expect(field).toHaveTextContent(value);
    }
  });

  it("still carries the range and volume measures", () => {
    render(<CandleReadoutPanel readout={readout} timeframeLabel="D" />);

    expect(screen.getByText("Range")).toBeInTheDocument();
    expect(screen.getByText("Vol")).toBeInTheDocument();
    expect(screen.getByText("0.2× avg")).toBeInTheDocument();
  });

  it("renders nothing without a bar to describe", () => {
    const { container } = render(<CandleReadoutPanel readout={null} timeframeLabel="D" />);

    expect(container).toBeEmptyDOMElement();
  });
});
