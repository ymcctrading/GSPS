import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TrackedExecuteList } from "./tracked-execute-list";
import type { TrackedExecuteRow } from "@/lib/dashboard/trackedExecute";

function stubQuote(price: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ price }) } as Response)),
  );
}

afterEach(() => vi.unstubAllGlobals());

const hdb: TrackedExecuteRow = {
  symbol: "HDB",
  direction: "bullish",
  patternName: "3-2-2",
  score: 6,
  outputState: "Execute",
  executeScore: 7,
  executeOutputState: "Execute",
  entry: 23.81,
  stopLoss: 22.69,
  takeProfit1: 25,
  masterProfit: 26,
};

describe("TrackedExecuteList", () => {
  it("shows symbol, live price, side and move type, then score then -> now, then the plan", async () => {
    stubQuote(23.95);
    render(<TrackedExecuteList initialRows={[hdb]} />);

    expect(await screen.findByText("$23.95")).toBeInTheDocument();
    expect(screen.getByText("Buy")).toBeInTheDocument();
    expect(screen.getByText("3-2-2")).toBeInTheDocument();
    expect(within(screen.getByTitle("Score when this setup entered Execute")).getByText("7")).toBeInTheDocument();
    expect(within(screen.getByTitle("Score now")).getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Entry $23.81")).toBeInTheDocument();
    expect(screen.queryByText("Invalidated")).not.toBeInTheDocument();
  });

  it("shows only the current score when the entry score wasn't recorded", async () => {
    stubQuote(23.95);
    render(<TrackedExecuteList initialRows={[{ ...hdb, executeScore: null, executeOutputState: null }]} />);

    await screen.findByText("$23.95");
    expect(screen.queryByTitle("Score when this setup entered Execute")).not.toBeInTheDocument();
    expect(screen.getByTitle("Score now")).toBeInTheDocument();
  });

  it("flags a row whose price has already broken the stop", async () => {
    stubQuote(22.5);
    render(<TrackedExecuteList initialRows={[hdb]} />);

    expect(await screen.findByText("Invalidated")).toBeInTheDocument();
  });
});
