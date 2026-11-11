/**
 * The measured record behind each kind of setup card, and whether that kind
 * may be shown as a card at all.
 *
 * Owner, 2026-11-10: a card is shown to a member only if the rule behind it
 * has a real chance to be profitable ("why would you suggest cards people can
 * use otherwise?"). It is judged his way (`lib/shadow/goodCall.ts`): after
 * the entry fills, TP1 reached before the stop is a good call, the stop first
 * a bad call. The read is pre-registered and done once, on stocks the rules
 * were never fitted on (private-research/card-goodcall/PREREG-GC1.md,
 * internal).
 *
 * The gate, owner 2026-11-11 (14:32 UTC, relayed): "if it's positive and it
 * proves that it works then it's a win and that's the only thing that
 * matters ... We are not trying to guarantee anything." A kind is shown when,
 * held out, its good-call rate beats the rate its own distances need to
 * break even and its calls average more than zero R. The same distances
 * bought on a random day (`randomExpectancyR`) and the pre-registered verdict
 * (`passed`) stay in the record and in the summary a member reads, as
 * information, never as a gate. (The 2026-11-10 gate also required beating
 * the random day; only RSI reversal cleared it.)
 *
 * A kind with no record (`null`) or a failing one is not shown as a card;
 * its levels can still be read where a member asks for them (a ticker's own
 * page, a strategy mode the member picked), labelled with this record.
 * This module is imported by client components, so it names no source,
 * method or internal rule: only the card kind's public id and its figures.
 *
 * Three-question basis:
 * 1. Gann: "when in doubt, keep out" (How to Make Profits in Commodities,
 *    p. 255): no card is a valid answer. Internal citation only.
 * 2. Cycles: Dewey's criterion 7 (persistence out of sample, fixed in
 *    advance) is why only a held-out read counts here.
 * 3. Hermetic: Cause and Effect and Mentalism: what a member is shown shapes
 *    what they do, so a card is shown with the evidence that it pays, or not
 *    at all. Law of Creation: the rule and the stock's own drift are the
 *    pair; the card is a creation only if it beats the random day (the I
 *    term), otherwise a mixture. The member is shown which, in the summary.
 */

import type { StrategyModeId } from "@/lib/strategies/types";

/** A kind of setup card: the platform's own plan ("gsps") or a strategy mode's. */
export type CardKind = StrategyModeId;

export interface CardRecord {
  /** Filled cards scored on the held-out read. */
  fills: number;
  /** Good calls over decided calls. */
  goodRate: number;
  /** The mean rate the cards' own distances need to break even. */
  breakEven: number;
  /** Mean result per decided call in R, to TP1 or the stop. */
  expectancyR: number;
  /** The same distances bought on a random day in the same stock and year: mean R. */
  randomExpectancyR: number;
  /** The years the read covers, e.g. "2018-2026". */
  period: string;
  /** Whether it passed every condition of the pre-registered read (information, not the gate). */
  passed: boolean;
  /** One plain sentence a member can read beside the card. */
  summary: string;
}

/**
 * The held-out record of each kind of card. `null` until a pre-registered
 * read has been made for it. Filled from
 * private-research/card-goodcall/RESULT-GC1.md (internal); a test holds each
 * entry to that run's figures.
 */
export const CARD_RECORDS: Record<CardKind, CardRecord | null> = {
  gsps: null,
  psarSupertrend: {
    fills: 645,
    goodRate: 0.4976,
    breakEven: 0.4123,
    expectancyR: 0.2076,
    randomExpectancyR: 0.2511,
    period: "2018-2026",
    passed: false,
    summary: "On 645 filled cards on large-cap stocks it was never tuned on (2018-2026), 49.8% reached their first target before their stop, against 41.2% needed to break even; +0.21R a call, short of the same levels on a random day (+0.25R).",
  },
  saraStrat: {
    fills: 99382,
    goodRate: 0.4163,
    breakEven: 0.4359,
    expectancyR: -0.0475,
    randomExpectancyR: 0.0306,
    period: "2018-2026",
    passed: false,
    summary: "On 99,382 filled cards on large-cap stocks it was never tuned on (2018-2026), 41.6% reached their first target before their stop, against 43.6% needed to break even; -0.05R a call, short of the same levels on a random day (+0.03R).",
  },
  maCrossover: {
    fills: 8481,
    goodRate: 0.4176,
    breakEven: 0.3460,
    expectancyR: 0.2066,
    randomExpectancyR: 0.2314,
    period: "2018-2026",
    passed: false,
    summary: "On 8,481 filled cards on large-cap stocks it was never tuned on (2018-2026), 41.8% reached their first target before their stop, against 34.6% needed to break even; +0.21R a call, short of the same levels on a random day (+0.23R).",
  },
  bollinger: {
    fills: 15043,
    goodRate: 0.5067,
    breakEven: 0.5001,
    expectancyR: 0.0233,
    randomExpectancyR: 0.0148,
    period: "2018-2026",
    passed: false,
    summary: "On 15,043 filled cards on large-cap stocks it was never tuned on (2018-2026), 50.7% reached their first target before their stop, against 50.0% needed to break even; +0.02R a call, beating the same levels on a random day (+0.01R).",
  },
  rsiReversal: {
    fills: 3589,
    goodRate: 0.4947,
    breakEven: 0.4459,
    expectancyR: 0.1153,
    randomExpectancyR: -0.0076,
    period: "2018-2026",
    passed: true,
    summary: "On 3,589 filled cards on large-cap stocks it was never tuned on (2018-2026), 49.5% reached their first target before their stop, against 44.6% needed to break even; +0.12R a call, beating the same levels on a random day (-0.01R).",
  },
  macdMomentum: {
    fills: 12162,
    goodRate: 0.4116,
    breakEven: 0.3474,
    expectancyR: 0.1848,
    randomExpectancyR: 0.2344,
    period: "2018-2026",
    passed: false,
    summary: "On 12,162 filled cards on large-cap stocks it was never tuned on (2018-2026), 41.2% reached their first target before their stop, against 34.7% needed to break even; +0.18R a call, short of the same levels on a random day (+0.23R).",
  },
  vwap: null,
  stochastic: {
    fills: 12337,
    goodRate: 0.4553,
    breakEven: 0.4430,
    expectancyR: 0.0264,
    randomExpectancyR: 0.0137,
    period: "2018-2026",
    passed: false,
    summary: "On 12,337 filled cards on large-cap stocks it was never tuned on (2018-2026), 45.5% reached their first target before their stop, against 44.3% needed to break even; +0.03R a call, beating the same levels on a random day (+0.01R).",
  },
  donchian: {
    fills: 25344,
    goodRate: 0.4332,
    breakEven: 0.3402,
    expectancyR: 0.2728,
    randomExpectancyR: 0.4799,
    period: "2018-2026",
    passed: false,
    summary: "On 25,344 filled cards on large-cap stocks it was never tuned on (2018-2026), 43.3% reached their first target before their stop, against 34.0% needed to break even; +0.27R a call, short of the same levels on a random day (+0.48R).",
  },
  elliottWave: {
    fills: 5911,
    goodRate: 0.6103,
    breakEven: 0.5240,
    expectancyR: 0.1679,
    randomExpectancyR: 0.2612,
    period: "2018-2026",
    passed: false,
    summary: "On 5,911 filled cards on large-cap stocks it was never tuned on (2018-2026), 61.0% reached their first target before their stop, against 52.4% needed to break even; +0.17R a call, short of the same levels on a random day (+0.26R).",
  },
};

/** Pure. Whether cards of this kind may be shown: positive on the held-out read (beats break-even, more than zero R). */
export function cardKindShown(kind: CardKind, records: Record<CardKind, CardRecord | null> = CARD_RECORDS): boolean {
  const r = records[kind];
  return r != null && r.fills > 0 && r.goodRate > r.breakEven && r.expectancyR > 0;
}

/** The sentence shown where a card would be when none of its kind may be shown. */
export const NO_CARD_NOTE =
  "No trade card today. A setup type is shown as a card only after its past calls reached their first target before their stop more often than they needed to, on stocks it was never tuned on.";
