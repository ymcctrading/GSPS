/**
 * The chart's periods-and-presets panel: it edits only the indicators that are
 * on, never a technique's own lines, and saves the chart as it stands.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IndicatorSettings } from "./indicator-settings";
import { DEFAULT_INDICATOR_PARAMS, type ChartOverlay, type ChartStudy, type ParamIndicator } from "@/lib/chart/indicatorParams";

function setup(over: Partial<Parameters<typeof IndicatorSettings>[0]> = {}) {
  const props = {
    params: DEFAULT_INDICATOR_PARAMS,
    presets: [],
    overlays: new Set<ChartOverlay>(["sma20", "ema9"]),
    studies: new Set<ChartStudy>(["rsi"]),
    techniqueKeys: new Set<ParamIndicator>(),
    techniqueName: null,
    saving: false,
    message: null,
    canSave: true,
    onChangeParams: vi.fn(),
    onSavePreset: vi.fn(),
    onDeletePreset: vi.fn(),
    onLoadPreset: vi.fn(),
    ...over,
  };
  render(<IndicatorSettings {...props} />);
  return props;
}

describe("IndicatorSettings", () => {
  it("shows periods only for the indicators that are on", () => {
    setup();
    expect(screen.getByText("SMA 20")).toBeTruthy();
    expect(screen.getByText("EMA 9")).toBeTruthy();
    expect(screen.getByText("RSI 14")).toBeTruthy();
    expect(screen.queryByText(/MACD/)).toBeNull();
  });

  it("commits a new period on Enter", async () => {
    const props = setup({ overlays: new Set<ChartOverlay>(["sma50"]), studies: new Set() });
    const input = screen.getByLabelText("Period");
    await userEvent.clear(input);
    await userEvent.type(input, "200{Enter}");
    expect(props.onChangeParams).toHaveBeenCalledWith({ ...DEFAULT_INDICATOR_PARAMS, sma50: { period: 200 } });
  });

  it("commits once, and not at all when nothing changed", async () => {
    const props = setup({ overlays: new Set<ChartOverlay>(["sma50"]), studies: new Set() });
    const input = screen.getByLabelText("Period");
    await userEvent.click(input);
    await userEvent.tab();
    expect(props.onChangeParams).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "100{Enter}");
    await userEvent.tab();
    expect(props.onChangeParams).toHaveBeenCalledTimes(1);
  });

  it("keeps the value in force when a field is emptied, out of range or inverted", async () => {
    const props = setup({ overlays: new Set<ChartOverlay>(["sma50"]), studies: new Set<ChartStudy>(["macd"]) });
    const period = screen.getByLabelText("Period");
    await userEvent.clear(period);
    await userEvent.tab();
    await userEvent.clear(period);
    await userEvent.type(period, "-5{Enter}");
    await userEvent.clear(screen.getByLabelText("Fast"));
    await userEvent.type(screen.getByLabelText("Fast"), "30{Enter}");
    expect(props.onChangeParams).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/fast period shorter/);
    expect((period as HTMLInputElement).value).toBe("50");
  });

  it("offers no saving when signed out", () => {
    setup({ canSave: false });
    expect(screen.queryByPlaceholderText("Preset name")).toBeNull();
    expect(screen.getByText(/Sign in to save/)).toBeTruthy();
  });

  it("does not let a technique's own lines be edited", () => {
    setup({
      overlays: new Set<ChartOverlay>(["ema9"]),
      studies: new Set(),
      techniqueKeys: new Set<ParamIndicator>(["ema9"]),
      techniqueName: "EMA9/SMA20 crossover (swing)",
    });
    expect(screen.queryByLabelText("Period")).toBeNull();
    expect(screen.getByText(/EMA9\/SMA20 crossover \(swing\)'s own periods/)).toBeTruthy();
  });

  it("saves, loads and deletes presets by name", async () => {
    const preset = { name: "Swing", overlays: ["sma20" as const], studies: [], params: DEFAULT_INDICATOR_PARAMS };
    const props = setup({ presets: [preset] });
    await userEvent.type(screen.getByPlaceholderText("Preset name"), "Day{Enter}");
    expect(props.onSavePreset).toHaveBeenCalledWith("Day");
    await userEvent.click(screen.getByRole("button", { name: "Swing" }));
    expect(props.onLoadPreset).toHaveBeenCalledWith(preset);
    await userEvent.click(screen.getByRole("button", { name: "Delete preset Swing" }));
    expect(props.onDeletePreset).toHaveBeenCalledWith("Swing");
  });
});
