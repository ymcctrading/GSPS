import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // Exit is the stop-loss; TP1 and MTP (master take profit) close the plan.
    expect(screen.getByText("Exit $22.69")).toBeInTheDocument();
    expect(screen.getByText("TP1 $25.00")).toBeInTheDocument();
    expect(screen.getByText("MTP $26.00")).toBeInTheDocument();
    expect(screen.queryByText("Invalidated")).not.toBeInTheDocument();
  });

  it("opens the setup card from the symbol, with the current score and a short synopsis", async () => {
    const user = userEvent.setup();
    stubQuote(23.95);
    render(<TrackedExecuteList initialRows={[hdb]} />);

    await screen.findByText("$23.95");
    expect(screen.queryByRole("link", { name: "Open the full scan for HDB" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "HDB" }));
    expect(screen.getByText(/A buy setup ready to act on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the full scan for HDB" })).toHaveAttribute("href", "/ticker/HDB");
  });

  it("shows only the current score when the entry score wasn't recorded", async () => {
    stubQuote(23.95);
    render(<TrackedExecuteList initialRows={[{ ...hdb, executeScore: null, executeOutputState: null }]} />);

    await screen.findByText("$23.95");
    expect(screen.queryByTitle("Score when this setup entered Execute")).not.toBeInTheDocument();
    expect(screen.getByTitle("Score now")).toBeInTheDocument();
  });

  it("moves a row whose price has already broken the stop into a closed group, out of the live list", async () => {
    const user = userEvent.setup();
    stubQuote(22.5);
    render(<TrackedExecuteList initialRows={[hdb, { ...hdb, symbol: "AAA", stopLoss: 20 }]} />);

    // AAA's stop (20) still stands at 22.50; HDB's (22.69) is through.
    const toggle = await screen.findByRole("button", { name: "Show setups that broke their stop (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "AAA" })).toBeInTheDocument();
    // Closed: the broken setup is not among the live ones.
    expect(screen.queryByRole("button", { name: "HDB" })).not.toBeInTheDocument();
    expect(screen.queryByText("Invalidated")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "HDB" })).toBeInTheDocument();
    expect(screen.getByText("Invalidated")).toBeInTheDocument();
    expect(screen.getByText(/dead level/)).toBeInTheDocument();
  });

  it("says so when every tracked setup has broken its stop", async () => {
    stubQuote(10);
    render(<TrackedExecuteList initialRows={[hdb]} />);

    expect(await screen.findByText(/None of your tracked setups is still live/)).toBeInTheDocument();
  });
});
