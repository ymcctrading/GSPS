import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GuideAvatar, GuidePair, GuideTip } from "./guide-avatar";

describe("GuideTip", () => {
  it("names its speaker beside the icon, so colour is never the only cue", () => {
    render(<GuideTip speaker="bear"><p>Every trade has a stop.</p></GuideTip>);
    const tip = screen.getByRole("note", { name: "Mrs. Bear" });
    expect(tip.textContent).toContain("Mrs. Bear");
    expect(tip.querySelector("svg.lucide")).not.toBeNull();
    expect(tip.className).toContain("border-l-guide-bear");
    expect(tip.className).not.toMatch(/bull/);
  });

  it("splits a paired tip green and red, each guide named on their own side", () => {
    render(<GuideTip speaker="both"><p>Hear both before you act.</p></GuideTip>);
    const tip = screen.getByRole("note", { name: "Mr. Bull and Mrs. Bear" });
    expect(tip.textContent).toContain("Mr. Bull");
    expect(tip.textContent).toContain("Mrs. Bear");
    const bar = tip.firstElementChild!;
    expect(bar.children[0].className).toContain("bg-guide-bull");
    expect(bar.children[1].className).toContain("bg-guide-bear");
  });
});

describe("GuideAvatar", () => {
  it("draws Mrs. Bear without any of Mr. Bull's green", () => {
    const { container } = render(<GuideAvatar guide="bear" />);
    expect(container.innerHTML).not.toContain("guide-bull");
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Mrs\. Bear/);
  });

  it("gives each avatar on a page its own clip path", () => {
    const { container } = render(<GuidePair />);
    const ids = [...container.querySelectorAll("clipPath")].map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });
});
