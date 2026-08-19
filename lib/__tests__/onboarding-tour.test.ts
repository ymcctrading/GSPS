/**
 * What the first-run tour is required to say, and required not to.
 *
 * The tour is the only surface in GSPS written for someone who has never traded
 * before, which makes its copy a product decision rather than a styling one —
 * and copy has no type system. These are the assertions that stand in for one.
 *
 * They fall into two groups. The structural checks (unique ids, resolvable
 * anchors, figures that exist) catch a step that would render broken. The
 * language checks catch a step that would render *fine* and still fail the
 * person it was written for: internal vocabulary that leaked in, a paragraph
 * that grew into a wall, or — the one that actually matters — a rewrite that
 * quietly dropped the sentence saying this is practice money.
 */

import { describe, expect, it } from "vitest";
import { TOUR_STEPS, TOUR_STEP_COUNT, TOUR_VERSION, stepById } from "@/lib/onboarding/tour";
import {
  SNAPSHOT_BARS,
  SNAPSHOT_EXIT_LADDER,
  SNAPSHOT_GUIDED,
  SNAPSHOT_LAST_CLOSE,
  SNAPSHOT_NOTICE,
  SNAPSHOT_PLAN,
  SNAPSHOT_RISK_PER_SHARE,
} from "@/lib/onboarding/spy-snapshot";
import {
  DEFAULT_MAX_DEPLOYED_PCT,
  DEFAULT_RISK_PCT,
} from "@/lib/guided/config";

/** Every `data-tour` value the nav actually renders, derived the same way it is. */
const NAV_ANCHORS = [
  "/dashboard",
  "/guided",
  "/scanner",
  "/portfolio",
  "/automation",
  "/learning",
  "/glossary",
  "/settings",
].map((href) => `nav-${href.slice(1)}`);

const FIGURES = ["none", "chart", "plan", "scan", "guided", "exits", "position", "backtest", "caps"];

const allCopy = TOUR_STEPS.flatMap((s) => [s.title, ...s.body]);

describe("tour structure", () => {
  it("has a stable, unique id for every step", () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z][a-z-]*$/.test(id))).toBe(true);
  });

  it("keeps the exported count in step with the list", () => {
    expect(TOUR_STEP_COUNT).toBe(TOUR_STEPS.length);
    expect(TOUR_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("finds steps by id, and does not invent ones that do not exist", () => {
    expect(stepById("welcome")?.title).toBe(TOUR_STEPS[0].title);
    expect(stepById("no-such-step")).toBeUndefined();
  });

  it("only points at anchors the nav actually renders", () => {
    // A typo here produces a tour that runs, says the right words and points at
    // nothing — the failure the overlay is deliberately built to survive, and
    // therefore the one nothing else would report.
    const anchors = TOUR_STEPS.map((s) => s.anchor).filter((a): a is string => Boolean(a));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(NAV_ANCHORS).toContain(anchor);
  });

  it("only asks for figures that exist", () => {
    for (const step of TOUR_STEPS) expect(FIGURES).toContain(step.figure);
  });

  it("gives every in-app link a label, and every label a link", () => {
    for (const step of TOUR_STEPS) {
      expect(Boolean(step.href)).toBe(Boolean(step.hrefLabel));
      if (step.href) expect(step.href.startsWith("/")).toBe(true);
    }
  });
});

describe("tour language", () => {
  it("uses none of the internal vocabulary", () => {
    const banned = [/\bgann\b/i, /\bstrat\b/i, /\bsquare[ -]of[ -](9|nine)\b/i, /\bs9\b/i, /\bsniper\b/i];
    const offenders = allCopy.filter((text) => banned.some((p) => p.test(text)));
    expect(offenders).toEqual([]);
  });

  it("keeps paragraphs short enough for a nervous first reader", () => {
    // Not a style preference: the overlay card is ~360px wide, and a paragraph
    // past this length stops being readable inside it and starts being scrolled.
    const tooLong = TOUR_STEPS.flatMap((s) => s.body.filter((p) => p.length > 320).map((p) => `${s.id}: ${p}`));
    expect(tooLong).toEqual([]);
  });

  it("gives every step a title and real body copy", () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(3);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.body.every((p) => p.trim().length > 0)).toBe(true);
    }
  });

  it("says the money is not real, early", () => {
    // The single most important sentence in the tour, and the easiest to lose
    // in a rewrite. It has to appear, and it has to appear before any step that
    // describes placing an order.
    const practiceIndex = TOUR_STEPS.findIndex((s) =>
      s.body.some((p) => /practice money|pretend money|paper trading/i.test(p)),
    );
    const guidedIndex = TOUR_STEPS.findIndex((s) => s.id === "guided");
    expect(practiceIndex).toBeGreaterThanOrEqual(0);
    expect(practiceIndex).toBeLessThan(guidedIndex);
  });

  it("says nothing trades without a person confirming it", () => {
    expect(allCopy.some((p) => /confirm/i.test(p) && /nothing|never|every/i.test(p))).toBe(true);
  });

  it("says these are rules-based suggestions rather than advice", () => {
    expect(allCopy.some((p) => /not financial advice|not personalized|rules, not financial advice/i.test(p)))
      .toBe(true);
  });

  it("tells the reader losing trades are normal", () => {
    expect(allCopy.some((p) => /loss|loses|losing/i.test(p) && /normal|part of it/i.test(p))).toBe(true);
  });

  it("warns that the example is not live data", () => {
    const exampleStep = stepById("example-note");
    expect(exampleStep).toBeDefined();
    expect(exampleStep!.body.some((p) => /saved snapshot|frozen/i.test(p))).toBe(true);
    expect(SNAPSHOT_NOTICE).toMatch(/not live data/i);
  });
});

describe("the frozen snapshot holds together", () => {
  it("has thirty candles in date order, each one internally possible", () => {
    expect(SNAPSHOT_BARS).toHaveLength(30);
    for (const bar of SNAPSHOT_BARS) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close));
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close));
    }
    const dates = SNAPSHOT_BARS.map((b) => b.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("quotes the same last close the candles end on", () => {
    expect(SNAPSHOT_BARS.at(-1)!.close).toBe(SNAPSHOT_LAST_CLOSE);
  });

  it("orders the plan the way a long trade has to be ordered", () => {
    // Stop below entry, both targets above it, second beyond the first. A
    // fixture that got this backwards would teach the reader a trade plan that
    // cannot exist.
    expect(SNAPSHOT_PLAN.stopLoss).toBeLessThan(SNAPSHOT_PLAN.entry);
    expect(SNAPSHOT_PLAN.takeProfit1).toBeGreaterThan(SNAPSHOT_PLAN.entry);
    expect(SNAPSHOT_PLAN.masterProfit).toBeGreaterThan(SNAPSHOT_PLAN.takeProfit1);
    expect(SNAPSHOT_RISK_PER_SHARE).toBeCloseTo(7.4, 10);
  });

  it("sizes the example by the cap the tour claims sized it", () => {
    // The tour tells the reader, in words, that the deployed-capital ceiling
    // produced 36 shares and the risk cap would have allowed 135. Both halves
    // of that sentence are checked against the caps the app actually ships, so
    // a change to either cap fails here rather than turning the tour into a
    // confident description of arithmetic that no longer happens.
    const equity = 100_000;
    const byRisk = Math.floor((equity * (DEFAULT_RISK_PCT / 100)) / SNAPSHOT_RISK_PER_SHARE);
    const byDeployed = Math.floor((equity * (DEFAULT_MAX_DEPLOYED_PCT / 100)) / SNAPSHOT_PLAN.entry);

    expect(byRisk).toBe(SNAPSHOT_GUIDED.qtyAllowedByRiskCap);
    expect(byDeployed).toBe(SNAPSHOT_GUIDED.qty);
    expect(Math.min(byRisk, byDeployed)).toBe(SNAPSHOT_GUIDED.qty);
    expect(SNAPSHOT_GUIDED.bindingCap).toBe("deployed");
  });

  it("states a dollar risk that matches the size and the stop", () => {
    expect(SNAPSHOT_GUIDED.riskUsd).toBeCloseTo(SNAPSHOT_GUIDED.qty * SNAPSHOT_RISK_PER_SHARE, 2);
    expect(SNAPSHOT_GUIDED.notionalUsd).toBeCloseTo(SNAPSHOT_GUIDED.qty * SNAPSHOT_PLAN.entry, 2);
  });

  it("sells exactly the position it opened, no more and no less", () => {
    const laddered = SNAPSHOT_EXIT_LADDER.reduce((sum, stage) => sum + stage.shares, 0);
    expect(laddered).toBe(SNAPSHOT_GUIDED.qty);
  });

  it("quotes the risk and reward figures its own sentences quote", () => {
    // The sentences are hand-written prose with numbers baked into them, which
    // is exactly where a fixture edit goes stale without anything noticing.
    expect(SNAPSHOT_GUIDED.riskRewardSentence).toContain(String(Math.round(SNAPSHOT_GUIDED.riskUsd)));
    expect(SNAPSHOT_GUIDED.riskRewardSentence).toContain(String(Math.round(SNAPSHOT_GUIDED.rewardUsd)));
    expect(SNAPSHOT_GUIDED.sizeSentence).toContain(String(SNAPSHOT_GUIDED.qty));
  });
});
