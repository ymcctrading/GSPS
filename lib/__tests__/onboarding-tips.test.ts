/**
 * The rules that keep a helpful mascot from becoming Clippy.
 *
 * Each assertion here maps to one of the reasons Clippy is a punchline:
 * he interrupted, he was hard to kill, and he came back. The state layer is
 * where "hard to kill" and "came back" are decided, so this is where they are
 * pinned down.
 */

import { describe, expect, it } from "vitest";
import {
  TIPS_DEFAULT,
  resolveTips,
  shouldShowTip,
  withDismissed,
} from "@/lib/onboarding/status";
import { TIPS, TIP_IDS, tipById } from "@/lib/onboarding/tips";
import { MASCOTS } from "@/components/onboarding/mascots";

describe("reading tip state", () => {
  it("shows tips to a user who has never touched the setting", () => {
    expect(resolveTips(null)).toEqual(TIPS_DEFAULT);
    expect(resolveTips({})).toEqual(TIPS_DEFAULT);
  });

  it("survives every wrong shape without throwing", () => {
    for (const junk of ["str", 7, [], true, { tips: null }, { tips: "on" }, { tips: [] }]) {
      expect(() => resolveTips(junk)).not.toThrow();
      expect(resolveTips(junk).enabled).toBe(true);
    }
  });

  it("only treats an explicit false as off", () => {
    // Guessing toward showing a tip is the opposite of how the tour's status
    // guesses, and deliberately so: a stray tip costs one click, a stray tour
    // covers the whole screen. The costs are not symmetric.
    expect(resolveTips({ tips: { enabled: false } }).enabled).toBe(false);
    expect(resolveTips({ tips: { enabled: "no" } }).enabled).toBe(true);
    expect(resolveTips({ tips: {} }).enabled).toBe(true);
  });

  it("ignores non-string entries in the dismissed list", () => {
    const state = resolveTips({ tips: { dismissed: ["stop-loss", 3, null, "score-badge"] } });
    expect(state.dismissed).toEqual(["stop-loss", "score-badge"]);
  });

  it("leaves the other prefs keys alone", () => {
    const state = resolveTips({
      onboarding: { seenAt: "2026-08-19T00:00:00.000Z" },
      guided: { riskPct: 1 },
      tips: { enabled: false, dismissed: ["stop-loss"] },
    });
    expect(state).toEqual({ enabled: false, dismissed: ["stop-loss"] });
  });
});

describe("dismissing", () => {
  it("is permanent, not per-session", () => {
    const after = withDismissed(TIPS_DEFAULT, "stop-loss");
    expect(shouldShowTip(after, "stop-loss")).toBe(false);
  });

  it("does not silence the other tips", () => {
    const after = withDismissed(TIPS_DEFAULT, "stop-loss");
    expect(shouldShowTip(after, "score-badge")).toBe(true);
  });

  it("is idempotent", () => {
    const once = withDismissed(TIPS_DEFAULT, "stop-loss");
    expect(withDismissed(once, "stop-loss").dismissed).toEqual(["stop-loss"]);
  });

  it("does not mutate the state it was given", () => {
    const before: typeof TIPS_DEFAULT = { enabled: true, dismissed: [] };
    withDismissed(before, "stop-loss");
    expect(before.dismissed).toEqual([]);
  });
});

describe("the global switch", () => {
  it("silences every tip at once", () => {
    const off = { enabled: false, dismissed: [] };
    for (const id of TIP_IDS) expect(shouldShowTip(off, id)).toBe(false);
  });

  it("does not resurrect individually dismissed tips when switched back on", () => {
    // A dismissal is a decision about that tip; the switch is a decision about
    // the feature. Conflating them would bring back hints the user said no to.
    const state = { enabled: true, dismissed: ["stop-loss"] };
    expect(shouldShowTip(state, "stop-loss")).toBe(false);
    expect(shouldShowTip(state, "score-badge")).toBe(true);
  });
});

describe("the tips themselves", () => {
  it("are few", () => {
    // The value of a contextual hint collapses once they are everywhere: a
    // user who dismisses without reading has been trained by volume.
    expect(TIP_IDS.length).toBeLessThanOrEqual(6);
  });

  it("each carry a mascot that exists, and a short body", () => {
    for (const tip of Object.values(TIPS)) {
      expect(MASCOTS[tip.mascot]).toBeDefined();
      expect(tip.title.length).toBeGreaterThan(3);
      // A paragraph here is a tour step in the wrong place.
      expect(tip.body.length).toBeLessThanOrEqual(220);
    }
  });

  it("give risk and protection to Mr. Bear", () => {
    expect(TIPS["stop-loss"].mascot).toBe("bear");
    expect(TIPS["paper-account"].mascot).toBe("bear");
    expect(TIPS["rejected-order"].mascot).toBe("bear");
  });

  it("key every tip by its own id, so a dismissal cannot silence the wrong one", () => {
    for (const [key, tip] of Object.entries(TIPS)) expect(tip.id).toBe(key);
  });

  it("look up an unknown id as null rather than throwing", () => {
    expect(tipById("no-such-tip")).toBeNull();
  });
});
