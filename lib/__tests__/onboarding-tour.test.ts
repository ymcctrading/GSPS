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
import { TOUR_STEPS, TOUR_STEP_COUNT, TOUR_VERSION, stepById, stepLink } from "@/lib/onboarding/tour";
import {
  SNAPSHOT_ACCOUNT,
  SNAPSHOT_BARS,
  SNAPSHOT_EXIT_LADDER,
  SNAPSHOT_GUIDED,
  SNAPSHOT_LAST_CLOSE,
  SNAPSHOT_NOTICE,
  SNAPSHOT_PLAN,
  SNAPSHOT_POSITION,
  SNAPSHOT_RISK_PER_SHARE,
} from "@/lib/onboarding/spy-snapshot";
import {
  DEFAULT_MAX_DEPLOYED_PCT,
  DEFAULT_RISK_PCT,
} from "@/lib/guided/config";
import { exitSentence, riskRewardSentence } from "@/lib/guided/copy";

/**
 * Every `data-tour` value rendered anywhere in the app.
 *
 * The nav tabs are still anchored (and still used by nothing, now that steps
 * point at page sections) but the list that matters is the second one: these
 * are attributes on real page content, added solely for the tour, and a step
 * naming one that no page renders is the failure this list exists to catch.
 *
 * Kept by hand rather than grepped: a test that discovers its own expectations
 * from the source it is testing passes whatever the source happens to say.
 */
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

/** Anchors on page content, one per section a step points at. */
const PAGE_ANCHORS = [
  "dash-watchlist",
  "dash-setups",
  "guided-card",
  "scanner-universe",
  "scanner-results",
  "portfolio-account",
  "automation-deployments",
  "backtest-run",
  "glossary-terms",
  "settings-caps",
];

const ALL_ANCHORS = [...NAV_ANCHORS, ...PAGE_ANCHORS];

/** Routes the app actually serves, for the steps that navigate. */
const ROUTES = [
  "/dashboard",
  "/guided",
  "/scanner",
  "/portfolio",
  "/automation",
  "/learning",
  "/glossary",
  "/settings",
];

const FIGURES = ["none", "chart", "plan", "scan", "guided", "exits", "portfolio", "backtest", "caps"];

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
    for (const anchor of anchors) expect(ALL_ANCHORS).toContain(anchor);
  });

  it("points at page content rather than nav tabs", () => {
    // The whole point of the change: a step about the Settings limits should
    // highlight the limits, not the Settings tab with the Dashboard behind it.
    const anchors = TOUR_STEPS.map((s) => s.anchor).filter((a): a is string => Boolean(a));
    expect(anchors.filter((a) => PAGE_ANCHORS.includes(a)).length).toBeGreaterThanOrEqual(10);
  });

  it("navigates to a route the app serves", () => {
    const routed = TOUR_STEPS.filter((s) => s.route);
    expect(routed.length).toBeGreaterThanOrEqual(10);
    for (const step of routed) expect(ROUTES).toContain(step.route);
  });

  it("puts every anchored step on the page holding its anchor", () => {
    // An anchor without a route would only resolve if the reader happened to
    // already be on the right page — which is exactly the bug being fixed.
    for (const step of TOUR_STEPS) {
      if (step.anchor && PAGE_ANCHORS.includes(step.anchor)) {
        expect(step.route, `step "${step.id}" anchors page content but has no route`).toBeTruthy();
      }
    }
  });

  it("only asks for figures that exist", () => {
    for (const step of TOUR_STEPS) expect(FIGURES).toContain(step.figure);
  });

  it("offers a way onward from every step that names a destination", () => {
    // /welcome is read rather than walked, so a step whose overlay version
    // navigates on the reader's behalf still needs a link there. Losing these
    // was a real regression when steps traded `href` for `route`.
    for (const step of TOUR_STEPS) {
      if (!step.route) continue;
      const link = stepLink(step);
      expect(link, `step "${step.id}" has a route but no link for /welcome`).not.toBeNull();
      expect(link!.href.startsWith("/")).toBe(true);
      expect(link!.label.length).toBeGreaterThan(4);
    }
  });

  it("prefers an explicit link over the step's own route", () => {
    // The chart step routes to the dashboard but its link says "pick a symbol",
    // which is a different and better instruction than "open the Dashboard".
    const chart = stepById("chart")!;
    expect(chart.href).toBe("/dashboard");
    expect(stepLink(chart)!.label).toBe(chart.hrefLabel);
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

/**
 * The prose guards.
 *
 * These exist because the first draft of this tour was rewritten wholesale for
 * reading like a children's book, and the specific mechanism was pronoun
 * chains: paragraphs that opened with "It" and then used "it" four more times,
 * leaving the reader to track referents instead of following the point. Prose
 * has no type system, so the failure recurs silently unless something checks.
 *
 * These are deliberately coarse. They cannot tell good writing from bad; they
 * can only catch the one measurable habit that produced the bad version, which
 * is enough to make a reviewer look.
 */
describe("prose quality", () => {
  const paragraphs = TOUR_STEPS.flatMap((s) => s.body.map((p) => ({ id: s.id, p })));

  it("never opens a paragraph with a bare pronoun", () => {
    // The first word of a paragraph has nothing behind it to refer to, so a
    // pronoun there always costs the reader a backward glance.
    const offenders = paragraphs
      .filter(({ p }) => /^(It|They|This does|These do)\b/.test(p))
      .map(({ id, p }) => `${id}: ${p.slice(0, 60)}…`);
    expect(offenders).toEqual([]);
  });

  it("keeps pronouns from crowding out the subject", () => {
    // Two per paragraph is comfortable; a third means the subject has stopped
    // being named and the paragraph has started referring to itself.
    const offenders = paragraphs
      .filter(({ p }) => (p.match(/\bit\b/gi) ?? []).length > 2)
      .map(({ id, p }) => `${id}: ${p.slice(0, 60)}…`);
    expect(offenders).toEqual([]);
  });

  it("names the product often enough to anchor the reader", () => {
    // Not a branding rule. "GSPS calculates the size" is the concrete
    // alternative to "it works it out", so the product name appearing across
    // several steps is evidence the subject is being named at all.
    const stepsNamingGsps = TOUR_STEPS.filter((s) => s.body.some((p) => p.includes("GSPS")));
    expect(stepsNamingGsps.length).toBeGreaterThanOrEqual(6);
  });

  it("does not cheerlead", () => {
    const offenders = paragraphs
      .filter(({ p }) => /!|that's the whole idea|super |awesome|don't worry/i.test(p))
      .map(({ id, p }) => `${id}: ${p.slice(0, 60)}…`);
    expect(offenders).toEqual([]);
  });

  it("opens with the title the product leads on", () => {
    expect(TOUR_STEPS[0].title).toBe("Welcome to GSPS — Trading Made Easy");
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

  it("reports an account whose parts add up to its total", () => {
    // The practice-money step shows this screen to prove the $100,000 is not
    // real. A reader who adds cash to holdings and gets a different total
    // learns the opposite lesson about how much to trust these numbers.
    expect(SNAPSHOT_ACCOUNT.cash + SNAPSHOT_ACCOUNT.holdingsValue).toBeCloseTo(SNAPSHOT_ACCOUNT.equity, 2);
    expect(SNAPSHOT_ACCOUNT.holdingsValue).toBeCloseTo(SNAPSHOT_POSITION.marketValue, 2);
    expect(SNAPSHOT_ACCOUNT.cash).toBeCloseTo(SNAPSHOT_ACCOUNT.startingCash - SNAPSHOT_GUIDED.notionalUsd, 2);
    expect(SNAPSHOT_ACCOUNT.dayPnlUsd).toBeCloseTo(SNAPSHOT_ACCOUNT.equity - SNAPSHOT_ACCOUNT.startingCash, 2);
  });

  it("shows the Portfolio screen on the step that talks about the money", () => {
    // The balances are the evidence for "none of this is real", so that step
    // has to render them rather than assert them in prose.
    expect(stepById("practice-money")?.figure).toBe("portfolio");
    expect(stepById("portfolio")?.figure).toBe("portfolio");
  });

  it("puts the real card's words in the example card", () => {
    // The Guided figure exists to look like the live card, so its sentences are
    // generated by the same functions the live card uses rather than written to
    // sound nicer here. A copy change in lib/guided/copy.ts fails this test,
    // which is the point: the tour must not keep teaching a card that no longer
    // exists.
    expect(SNAPSHOT_GUIDED.riskRewardSentence).toBe(
      riskRewardSentence(SNAPSHOT_GUIDED.riskUsd, SNAPSHOT_GUIDED.rewardUsd),
    );
    expect(SNAPSHOT_GUIDED.exitSentence).toBe(
      exitSentence(SNAPSHOT_EXIT_LADDER[0].shares, SNAPSHOT_GUIDED.qty, "buy"),
    );
  });

  it("quotes the risk and reward figures its own sentences quote", () => {
    // The sentences are hand-written prose with numbers baked into them, which
    // is exactly where a fixture edit goes stale without anything noticing.
    expect(SNAPSHOT_GUIDED.riskRewardSentence).toContain(String(Math.round(SNAPSHOT_GUIDED.riskUsd)));
    expect(SNAPSHOT_GUIDED.riskRewardSentence).toContain(String(Math.round(SNAPSHOT_GUIDED.rewardUsd)));
    expect(SNAPSHOT_GUIDED.sizeSentence).toContain(String(SNAPSHOT_GUIDED.qty));
  });
});
