/**
 * Trading vocabulary by school tier (owner, 2026-11-12).
 *
 * Every term is introduced in the tier whose school teaches it. In that tier
 * the platform shows it with a plain-word gloss first ("Entry (buy stop)");
 * from the next tier on it is used plainly ("Buy stop"). A member who has
 * unlocked, graduated into or paid for a tier has everything that tier
 * teaches, so the member's tier (`profiles.tier`, however it was reached:
 * lib/promotion's three paths) is the only input.
 *
 * Only public trading vocabulary lives here (owner, 2026-11-12: "some things
 * should stay intellectual property"). No tier unlocks the back end's
 * sources, rules, scoring criteria or formulas, so none of them is a term.
 *
 * Client-safe and pure: no curriculum import, so a client bundle carries only
 * these strings. `lib/school/__tests__/terms.test.ts` checks each term's tier
 * against the curriculum, so a lesson that moves academies moves the term.
 *
 * Three-question basis: 1. Method: knowledge comes first and stop-loss orders
 * go with every trade (ref: SRC-004, pp.8-9 and 46); the label
 * carries the lesson onto the live card. 2. Cycles: no periodicity claim.
 * 3. Hermetic: Correspondence (the school and the platform speak one
 * language) and Rhythm (learning unlocks use, in order). Law of Creation: the
 * lesson paired with the live label creates a term the member can act on.
 */

import { TIER_ORDER, type PlatformTier } from "@/lib/tiers";

export type TermId =
  | "buyStop"
  | "sellStop"
  | "stopLoss"
  | "tp1"
  | "tp2"
  | "mtp"
  | "delta"
  | "gamma"
  | "theta"
  | "vega"
  | "impliedVol"
  | "openInterest";

export interface TermEntry {
  /** The curriculum lesson that teaches the term (lib/school/curriculum.ts). */
  lessonId: string;
  /** The tier whose school introduces it: the earliest program of that lesson's academy. */
  introducedIn: PlatformTier;
  /** How the introducing tier (and any tier below it) reads it: plain words first. */
  introduced: string;
  /** How every later tier reads it. */
  plain: string;
}

const ORDER_TYPES = "academy-2/mechanics/order-types";
const TRADE_LEVELS = "academy-2/mechanics/entry-confirmation";
/** The options chain's figures are taught in the options literacy lesson (Academy 7). */
const OPTIONS = "academy-7/portfolio/conceptual-literacy";

export const TERMS: Record<TermId, TermEntry> = {
  buyStop: {
    lessonId: ORDER_TYPES,
    introducedIn: "PRACTICE",
    introduced: "Entry (buy stop)",
    plain: "Buy stop",
  },
  sellStop: {
    lessonId: ORDER_TYPES,
    introducedIn: "PRACTICE",
    introduced: "Entry (sell stop)",
    plain: "Sell stop",
  },
  stopLoss: {
    lessonId: TRADE_LEVELS,
    introducedIn: "PRACTICE",
    introduced: "Exit if wrong (stop loss)",
    plain: "Stop loss",
  },
  tp1: {
    lessonId: TRADE_LEVELS,
    introducedIn: "PRACTICE",
    introduced: "First target (TP1)",
    plain: "TP1",
  },
  tp2: {
    lessonId: TRADE_LEVELS,
    introducedIn: "PRACTICE",
    introduced: "Second target (TP2)",
    plain: "TP2",
  },
  mtp: {
    lessonId: TRADE_LEVELS,
    introducedIn: "PRACTICE",
    introduced: "Master target (MTP)",
    plain: "MTP",
  },
  delta: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Delta (moves per $1 in the stock)",
    plain: "Delta",
  },
  gamma: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Gamma (how fast delta changes)",
    plain: "Gamma",
  },
  theta: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Theta (value lost per day)",
    plain: "Theta",
  },
  vega: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Vega (moves per 1% of volatility)",
    plain: "Vega",
  },
  impliedVol: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Implied volatility (IV)",
    plain: "IV",
  },
  openInterest: {
    lessonId: OPTIONS,
    introducedIn: "INVESTOR_MODE",
    introduced: "Open interest (contracts open)",
    plain: "Open interest",
  },
};

/**
 * The reader's tier, or null when nobody is signed in. A visitor has not
 * started the school, so null reads every term as introduced.
 */
export type VocabularyTier = PlatformTier | null;

/** True once the reader is past the tier that introduces the term. */
export function termIsFamiliar(id: TermId, tier: VocabularyTier): boolean {
  if (tier == null) return false;
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(TERMS[id].introducedIn);
}

/** The term as this reader reads it. */
export function termLabel(id: TermId, tier: VocabularyTier): string {
  return termIsFamiliar(id, tier) ? TERMS[id].plain : TERMS[id].introduced;
}

/**
 * How a later tier says the term inside a sentence, where it differs from the
 * label ("stop 97.00" rather than "Stop loss 97.00").
 */
const IN_SENTENCE: Partial<Record<TermId, string>> = { buyStop: "buy stop", sellStop: "sell stop", stopLoss: "stop" };

/**
 * The term as this reader reads it inside a sentence: lower-case lead for the
 * gloss ("exit if wrong (stop loss) 97.00"), the short word once familiar
 * ("stop 97.00"). For messages written on the server for one member.
 */
export function termInSentence(id: TermId, tier: VocabularyTier): string {
  if (termIsFamiliar(id, tier)) return IN_SENTENCE[id] ?? TERMS[id].plain;
  const t = TERMS[id].introduced;
  return t.charAt(0).toLowerCase() + t.slice(1);
}
