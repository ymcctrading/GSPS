import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "./collapsible-section";

describe("CollapsibleSection", () => {
  it("starts closed, says how much is inside, and mounts nothing until opened", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Saved setups" count={4}>
        <p>the list</p>
      </CollapsibleSection>,
    );

    const toggle = screen.getByRole("button", { name: "Show saved setups (4)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("the list")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Hide saved setups (4)" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("the list")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide saved setups (4)" }));
    expect(screen.queryByText("the list")).not.toBeInTheDocument();
  });

  it("keeps a proper noun's capital while lower-casing the sentence start", () => {
    render(
      <CollapsibleSection title="Your tracked Execute setups" count={2}>
        <p>x</p>
      </CollapsibleSection>,
    );
    expect(screen.getByRole("button", { name: "Show your tracked Execute setups (2)" })).toBeInTheDocument();
  });

  it("can start open, and needs no count", () => {
    render(
      <CollapsibleSection title="Notes" defaultOpen>
        <p>open already</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("open already")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide notes" })).toBeInTheDocument();
  });

  it("wires the button to the region it controls", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Saved setups" count={1}>
        <p>the list</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button");
    await user.click(toggle);
    const id = toggle.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).toContainElement(screen.getByText("the list"));
  });
});
