/**
 * Your record (Q3 plan item 2): the card reads the record, shows the pause
 * beside the loss that started it, and saves a member's note.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TradeRecord } from "../trade-record";
import { readTradeRecord } from "@/lib/portfolio/tradeRecord";

const exits = ["2026-11-03T15:00:00Z", "2026-11-04T15:00:00Z", "2026-11-05T15:00:00Z"];
const record = readTradeRecord(exits.map((e, i) => ({ id: `t${i + 1}`, symbol: "AAA", outcome: "loss" as const, exitTimestamp: e, profitLossDollars: -50 })));
const trades = exits
  .map((e, i) => ({
    id: `t${i + 1}`,
    symbol: "AAA",
    direction: "buy",
    quantity: 10,
    entryPrice: 100,
    exitTimestamp: e,
    exitPrice: 95,
    outcome: "loss",
    profitLossDollars: -50,
    exitCondition: "stop_loss",
    account: "paper",
    startedPause: i === 2,
    note: null,
  }))
  .reverse();

function mockFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/trade-notes")) {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ note: body.note.trim() || null }) } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ record, total: 3, trades }) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("TradeRecord", () => {
  it("shows the count, the runs and the pause, and saves a note", async () => {
    const fetchMock = mockFetch();
    render(<TradeRecord />);
    expect(await screen.findByText("Your record (3)")).toBeTruthy();
    fireEvent.click(screen.getByText("Your record (3)"));

    expect(await screen.findByText(/3 losses in a row; paused from Nov 5, entries resumed Nov 9\./)).toBeTruthy();
    expect(screen.getByText(/started a pause on new entries/)).toBeTruthy();
    expect(screen.getAllByText(/Stop/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("Add a note")[0]);
    fireEvent.change(screen.getByPlaceholderText(/What you saw/), { target: { value: " bought into resistance " } });
    fireEvent.click(screen.getByText("Save note"));
    await waitFor(() => expect(screen.getByText("bought into resistance")).toBeTruthy());
    const put = fetchMock.mock.calls.find(([u]) => String(u) === "/api/trade-notes")!;
    expect(JSON.parse(String(put[1]?.body))).toMatchObject({ tradeLogId: "t3" });
    expect(screen.getAllByText("Edit note").length).toBe(1);
  });
});
