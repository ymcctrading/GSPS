import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedSetupsList, type SavedSetupRow } from "./saved-setups-list";

afterEach(() => vi.unstubAllGlobals());

const base: SavedSetupRow = {
  id: "1",
  symbol: "OXY",
  direction: "bullish",
  score: 7,
  output_state: "Execute",
  entry: 60,
  stop_loss: 57,
  take_profit1: 66,
  master_profit: 72,
  pattern_name: null,
  setup_kind: "reversion",
  saved_at: "2026-09-28T13:00:00.000Z",
  folderName: "Saved setups",
  currentScore: 6,
  currentOutputState: "Execute",
  monitorState: "EXECUTE",
};

describe("SavedSetupsList", () => {
  it("shows the plan with an exit and an MTP, and the score when saved against the score now", () => {
    render(<SavedSetupsList initialRows={[base]} />);

    expect(screen.getByText("Entry $60.00")).toBeInTheDocument();
    expect(screen.getByText("Exit $57.00")).toBeInTheDocument();
    expect(screen.getByText("TP1 $66.00")).toBeInTheDocument();
    expect(screen.getByText("MTP $72.00")).toBeInTheDocument();
    expect(screen.getByTitle("Score when saved")).toBeInTheDocument();
    expect(screen.getByTitle("Score in today's scan")).toBeInTheDocument();
  });

  it("opens the setup card from the symbol, ending in the link to the full scan", async () => {
    const user = userEvent.setup();
    render(<SavedSetupsList initialRows={[base]} />);

    await user.click(screen.getByRole("button", { name: "OXY" }));
    expect(screen.getByText(/A buy setup ready to act on/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the full scan for OXY" })).toHaveAttribute("href", "/ticker/OXY");
  });

  it("keeps setups the monitor has retired in a closed group, out of the standing list", async () => {
    const user = userEvent.setup();
    render(
      <SavedSetupsList
        initialRows={[
          base,
          { ...base, id: "2", symbol: "GOOGL", monitorState: "INVALIDATED" },
          { ...base, id: "3", symbol: "XOM", monitorState: "EXPIRED" },
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "OXY" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "GOOGL" })).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show no longer valid setups (2)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "GOOGL" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "XOM" })).toBeInTheDocument();
    expect(screen.getByText("Invalidated")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("says so when everything in a folder has been retired", () => {
    render(<SavedSetupsList initialRows={[{ ...base, monitorState: "INVALIDATED" }]} />);
    expect(screen.getByText("Every setup in this folder is no longer valid.")).toBeInTheDocument();
  });

  it("groups by folder", () => {
    render(
      <SavedSetupsList
        initialRows={[base, { ...base, id: "2", symbol: "MSFT", folderName: "Swing ideas" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Saved setups" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Swing ideas" })).toBeInTheDocument();
  });

  it("removes a row optimistically and puts it back if the delete fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false } as Response)));
    render(<SavedSetupsList initialRows={[base]} />);

    await user.click(screen.getByTitle("Remove from saved setups"));
    expect(await screen.findByRole("button", { name: "OXY" })).toBeInTheDocument();
  });

  it("handles a setup saved without a score", async () => {
    const user = userEvent.setup();
    render(<SavedSetupsList initialRows={[{ ...base, score: null, output_state: null, currentScore: null }]} />);
    await user.click(screen.getByRole("button", { name: "OXY" }));
    expect(screen.getByText("Saved without a score")).toBeInTheDocument();
    expect(screen.queryByText(/checks line up/)).not.toBeInTheDocument();
  });

  it("explains an empty list", () => {
    render(<SavedSetupsList initialRows={[]} />);
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  });
});
