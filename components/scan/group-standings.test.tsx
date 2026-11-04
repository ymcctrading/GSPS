/** The Groups tab lists the groups and opens one to its stocks. */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { GroupStandings } from "./group-standings";
import type { GroupView } from "@/lib/scanner/groupView";

const VIEW: GroupView = {
  month: "2026-10",
  breadth: { stocks: 3, stocksUpperHalf: 2, groups: 1, groupsUpperHalf: 1 },
  groups: [
    {
      key: "semis",
      label: "Semiconductors",
      standing: 0.91,
      medianPosition: 0.8,
      members: [
        { symbol: "AAA", position: 0.95, universePercentile: 0.97, groupRank: 1 },
        { symbol: "BBB", position: 0.65, universePercentile: 0.7, groupRank: 2 },
      ],
    },
    { key: "thin", label: "Thin group", standing: null, medianPosition: 0.2, members: [{ symbol: "CCC", position: 0.2, universePercentile: 0.1, groupRank: 1 }] },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GroupStandings", () => {
  it("shows breadth and the groups, and opens a group to its stocks", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => VIEW }));
    render(<GroupStandings />);
    expect(await screen.findByText("Semiconductors")).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByText("Too few to rank")).toBeTruthy();
    expect(screen.queryByText("AAA")).toBeNull();
    const row = screen.getByRole("button", { name: "Semiconductors, 1 of 1, 2 stocks, standing 91%" });
    fireEvent.click(row);
    expect(screen.getByText("AAA").getAttribute("href")).toContain("AAA");
    expect(screen.getByText("95%")).toBeTruthy();
    fireEvent.click(row);
    expect(screen.queryByText("AAA")).toBeNull();
  });

  it("says so when the standings can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Not available" }) }));
    render(<GroupStandings />);
    expect(await screen.findByText("Not available")).toBeTruthy();
  });
});
