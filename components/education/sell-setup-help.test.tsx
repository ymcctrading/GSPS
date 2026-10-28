/**
 * "How do I trade a sell setup?" shows to a Novice only, resolved on the
 * server, and its copy stays plain education.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SellSetupHelp, resetSellSetupHelpCache } from "./sell-setup-help";
import { SELL_SETUP_HELP, SELL_SETUP_LESSON_HREF, SELL_SETUP_LESSON_ID } from "@/lib/education/sellSetupHelp";
import { getLesson } from "@/lib/school/curriculum";

afterEach(() => {
  vi.unstubAllGlobals();
  resetSellSetupHelpCache();
});

describe("SellSetupHelp", () => {
  it("shows the note and the lesson link to a Novice", () => {
    render(<SellSetupHelp novice />);
    expect(screen.getByText(SELL_SETUP_HELP.title)).toBeTruthy();
    expect(screen.getByText(SELL_SETUP_HELP.lessonLink).closest("a")?.getAttribute("href")).toBe(SELL_SETUP_LESSON_HREF);
  });

  it("shows nothing above Novice", () => {
    const { container } = render(<SellSetupHelp novice={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("asks the server for the tier when the page doesn't know it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ novice: true }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<SellSetupHelp />);
    expect(await screen.findByText(SELL_SETUP_HELP.title)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/novice");
  });

  it("stays hidden when the tier read fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { container } = render(<SellSetupHelp />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.innerHTML).toBe("");
  });
});

describe("the sell setup lesson", () => {
  it("exists in Academy 1, open from the first day", () => {
    expect(SELL_SETUP_LESSON_ID.startsWith("academy-1/")).toBe(true);
    expect(getLesson(SELL_SETUP_LESSON_ID)).toBeTruthy();
  });

  it("covers the note's ground: the analogy, the stop, the alternatives and covered calls", () => {
    const text = getLesson(SELL_SETUP_LESSON_ID)!.lesson.instruction.join(" ");
    for (const phrase of ["concert ticket", "margin account", "stop loss", "put option", "inverse fund", "covered call"]) {
      expect(text).toContain(phrase);
    }
  });
});
