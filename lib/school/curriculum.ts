/**
 * GSPS School — full curriculum.
 *
 * Extends the pilot's conventions (`lib/school/content.ts`: typed content,
 * versioned as code, `validateLessonPublishable`-style gating, the
 * all-questions-correct quiz-mastery rule) to the eight-academy learner map
 * described in the product spec. The pilot module itself
 * (`LIVE_TRADING_RECERTIFICATION_*` in `lib/school/content.ts`) is
 * untouched and is referenced here only as "Course W2" inside Academy 8 —
 * see `WALL_STREET_CAPSTONE_COURSE_ID` and the academy 8 definition below.
 *
 * Two ladders, kept synchronized but distinct:
 *  - Learner-facing: 8 academies (`ACADEMIES`).
 *  - Entitlement-facing: 4 programs mapped to the real billing tiers in
 *    `lib/tiers.ts` (`SCHOOL_PROGRAMS`). An academy can belong to more than
 *    one program (Academy 5 spans Pro + Expert; Academy 6 spans Expert +
 *    Wall Street) — `academy.programIds` lists every program it counts
 *    toward, `academy.gateStatus` never varies by which program is asking
 *    (an academy is either required somewhere or it isn't).
 *
 * This module never mutates tier, entitlement, or promotion state itself —
 * see `lib/school/gates.ts` for the write path, and section 8 of the
 * product spec for why: Pro/Expert School progress is advisory only, and
 * only Foundations (Novice) and the Wall Street capstone have real
 * consequences.
 */

import type { PlatformTier } from "@/lib/tiers";
import type { QuizQuestion } from "@/lib/school/content";

export const SCHOOL_CURRICULUM_PROGRAM_ID = "gsps-school-curriculum";
export const CURRICULUM_VERSION = "2026.09.1";

/** Every lesson requiring "no guarantee of outcome" language carries this exact disclaimer. */
export const NO_GUARANTEE_DISCLAIMER =
  "No signal, pattern, backtest, or exercise in GSPS School is a guarantee of any trading outcome. This is capability-verification education, not investment advice.";

export type SchoolProgramId =
  | "foundations"
  | "sharpening-the-edge"
  | "professional-toolkit"
  | "systemization-capital-stewardship";

export type GateStatus = "required" | "advisory";

export interface SchoolProgram {
  id: SchoolProgramId;
  label: string;
  /** The real billing/behavioral tier this program is entitlement-aware of. */
  tier: PlatformTier;
  gateStatus: GateStatus;
  /** Plain-language statement of what completing this program does or does not unlock. */
  consequence: string;
}

export const SCHOOL_PROGRAMS: readonly SchoolProgram[] = [
  {
    id: "foundations",
    label: "Foundations",
    tier: "PRACTICE",
    gateStatus: "required",
    consequence:
      "Required alongside the existing behavioral promotion requirements in lib/promotion — completing it writes education_completed_at and, separately, practice_validation_completed_at, which feed Pro-eligibility as additive inputs. It does not replace trade count, account age, execution score, stop adherence, or position-size compliance.",
  },
  {
    id: "sharpening-the-edge",
    label: "Sharpening the Edge",
    tier: "STANDARD",
    gateStatus: "advisory",
    consequence: "Advisory only. Progress is saved. It never blocks or grants Pro access.",
  },
  {
    id: "professional-toolkit",
    label: "Professional Toolkit",
    tier: "INVESTOR_MODE",
    gateStatus: "advisory",
    consequence: "Advisory only. Progress is saved. Expert purchase is never gated on School.",
  },
  {
    id: "systemization-capital-stewardship",
    label: "Systemization & Capital Stewardship",
    tier: "SYSTEM_MASTERY",
    gateStatus: "required",
    consequence:
      "Required before checkout. Completing the Academy 8 capstone (not Course W2) writes wall_street_school_completed_at, which the Wall Street checkout route enforces server-side.",
  },
] as const;

export function schoolProgram(id: SchoolProgramId): SchoolProgram {
  const program = SCHOOL_PROGRAMS.find((p) => p.id === id);
  if (!program) throw new Error(`Unknown school program "${id}"`);
  return program;
}

/**
 * The three-element method's required learner-output shape, referenced by
 * lesson/lab metadata to say which fields a Bull/Bear/Operator activity in
 * this lesson must collect. `lib/school/bull-bear.ts` is the runtime type
 * for what a learner actually submits and how it's scored — this is only
 * the "does this lesson require one" flag plus which optional fields apply.
 */
export interface BullBearRequirement {
  required: true;
  /** Whether this activity also requires the market-regime checkpoint (Vibration) before it opens. */
  requiresRegimeCheckpoint: boolean;
  /** hypothetical | simulation | paper_trading | recorded_behavior — shown to the learner per lesson-player rules. */
  scenarioBasis: "hypothetical" | "simulation" | "paper_trading" | "recorded_behavior";
}

export interface CurriculumLesson {
  id: string;
  title: string;
  objectives: readonly string[];
  estimatedMinutes: number;
  instruction: readonly string[];
  application: string;
  quiz: readonly QuizQuestion[];
  bullBear?: BullBearRequirement;
  /** Metric-provenance labels this lesson surfaces to the learner, per spec section 13. */
  metricsShown?: readonly { label: string; provenance: "measured" | "learner_reported" | "planned" }[];
  reviewMeta: {
    author: string;
    lastReviewedAt: string;
    status: "draft" | "in_review" | "approved" | "published" | "archived";
  };
}

export interface CurriculumCourse {
  id: string;
  slug: string;
  title: string;
  outcome: string;
  lessons: readonly CurriculumLesson[];
}

export interface Academy {
  id: string;
  slug: string;
  number: number;
  title: string;
  outcome: string;
  /** Every program this academy counts toward (learner-map placement can span more than one). */
  programIds: readonly SchoolProgramId[];
  gateStatus: GateStatus;
  /** Academy ids that must be complete (all published lessons passed) before this one unlocks. */
  prerequisiteAcademyIds: readonly string[];
  courses: readonly CurriculumCourse[];
}

function q(question: string, choices: readonly string[], correctIndex: number): QuizQuestion {
  return { question, choices, correctIndex };
}

const AUTHOR = { author: "GSPS School", lastReviewedAt: "2026-09-01", status: "published" as const };

// ---------------------------------------------------------------------------
// Academy 1 — Market Orientation (Foundations, Novice, required)
// ---------------------------------------------------------------------------
const ACADEMY_1: Academy = {
  id: "academy-1",
  slug: "market-orientation",
  number: 1,
  title: "Market Orientation",
  outcome:
    "Explain what markets do, who participates and why, how U.S. equities trade, and where the line sits between education, investing, trading, speculation, and gambling.",
  programIds: ["foundations"],
  gateStatus: "required",
  prerequisiteAcademyIds: [],
  courses: [
    {
      id: "academy-1/orientation",
      slug: "orientation",
      title: "What Markets Do",
      outcome: "Describe markets, participants, incentives, and the scope GSPS actually executes in.",
      lessons: [
        {
          id: "academy-1/orientation/what-markets-do",
          title: "What Markets Do",
          objectives: [
            "State the two core functions a public market performs: price discovery and capital allocation.",
            "Explain why a market needs disagreement between buyers and sellers to function at all.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "A public market exists to do two things: discover a price that reflects everyone's current information and willingness to trade, and route capital toward the uses participants collectively judge most worthwhile. Neither function works without disagreement — a market where everyone agreed on fair value would have no trades, because a trade requires a buyer who thinks the price is fair-or-better and a seller who thinks the same in the opposite direction.",
            "Price discovery is continuous, not a single event. Every trade is one data point in a running estimate that never finishes updating, because new information (earnings, macro data, sentiment shifts, order flow) never stops arriving.",
            "This matters for how you read GSPS output: a signal, a score, a pattern is a snapshot of that continuous, disagreement-driven process — not a verdict from an authority. " + NO_GUARANTEE_DISCLAIMER,
          ],
          application:
            "Pick one U.S.-listed stock you recognize. In one or two sentences, describe what information you think is currently being priced into it — earnings expectations, a macro factor, sentiment, something else.",
          quiz: [
            q(
              "A market with zero disagreement between buyers and sellers would have:",
              ["More trades", "Fewer or no trades", "Lower volatility only", "Perfect price discovery"],
              1,
            ),
            q(
              "Price discovery is best described as:",
              ["A single daily event at market open", "A continuous, ongoing process", "Something only exchanges perform", "A guarantee of fair value"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-1/orientation/participants-and-incentives",
          title: "Market Participants and Incentives",
          objectives: [
            "Name at least four categories of market participant and one distinct incentive each.",
            "Explain why understanding a counterparty's incentive matters for reading price action.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "Retail investors, market makers, institutional asset managers, algorithmic/systematic traders, and corporate insiders all trade the same securities for different reasons. A market maker is compensated for providing continuous two-sided liquidity and manages inventory risk, not directional conviction. An institutional manager may be forced to rebalance on a schedule regardless of their view on price. A retail trader is typically unconstrained by mandate but also unconstrained by the risk controls larger participants are required to run.",
            "None of these incentives are visible directly in a price chart — but they explain patterns you will see repeatedly: end-of-quarter rebalancing flows, options-expiration volatility, and liquidity that dries up around scheduled news.",
            "GSPS scope: this platform scans, charts, and executes in U.S. equities only. Every participant discussion in this academy is grounded in that scope, not futures, forex, or crypto market structure.",
          ],
          application:
            "Name one type of participant whose forced or scheduled activity (not conviction-driven) could explain a price move that otherwise looks unexplained.",
          quiz: [
            q(
              "A market maker's core incentive is best described as:",
              ["Maximum directional conviction", "Compensation for providing liquidity while managing inventory risk", "Long-term buy-and-hold returns", "Matching retail sentiment"],
              1,
            ),
            q(
              "What is GSPS's actual execution scope?",
              ["Global multi-asset", "U.S. equities only", "Options and futures only", "Crypto and forex only"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-1/orientation/boundaries",
          title: "Education, Investing, Trading, Speculation, and Gambling",
          objectives: [
            "Distinguish investing, trading, speculation, and gambling by process and edge, not by outcome.",
            "Identify at least two common fraud patterns targeting retail traders.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "These four words get used interchangeably but describe different processes. Investing allocates capital based on a business/fundamental thesis over a long horizon. Trading takes a position based on a defined, risk-managed thesis over a shorter horizon with an explicit exit plan. Speculation takes a directional bet with limited underlying analysis, often on a shorter horizon, and can be a legitimate, small, clearly-labeled part of a plan. Gambling stakes capital on an outcome with no persistent edge and often no risk-defined exit — the defining failure is not the time horizon, it's the absence of a repeatable, evaluable process.",
            "A profitable outcome does not retroactively make an undisciplined decision a 'trade' — and an unprofitable outcome does not make a disciplined, risk-defined decision a mistake. GSPS School teaches process; it never teaches outcome-chasing.",
            "Common fraud patterns to recognize: guaranteed-return pitches (no legitimate market participant can guarantee returns), pressure to act immediately without independent verification, and unregistered/unlicensed 'advisors' soliciting funds outside a regulated brokerage relationship.",
          ],
          application:
            "Write one sentence distinguishing a 'trade' from a 'gamble' using the process criterion from this lesson, not the outcome.",
          quiz: [
            q(
              "What is the defining failure mode of gambling, per this lesson?",
              ["Losing money", "Short time horizon", "Absence of a repeatable, evaluable process", "Using leverage"],
              2,
            ),
            q(
              "A guaranteed-return pitch from an unregistered advisor is:",
              ["A normal part of active trading", "A red flag for fraud", "Only a concern above $10,000", "Standard for options trading"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 2 — Trading Mechanics (Foundations, Novice, required)
// ---------------------------------------------------------------------------
const ACADEMY_2: Academy = {
  id: "academy-2",
  slug: "trading-mechanics",
  number: 2,
  title: "Trading Mechanics",
  outcome: "Operate order types correctly, read basic chart structure, and confirm an entry before acting on it.",
  programIds: ["foundations"],
  gateStatus: "required",
  prerequisiteAcademyIds: ["academy-1"],
  courses: [
    {
      id: "academy-2/mechanics",
      slug: "mechanics",
      title: "Order Types and Entry Confirmation",
      outcome: "Use market/limit/stop/stop-limit orders correctly and confirm an entry trigger before acting.",
      lessons: [
        {
          id: "academy-2/mechanics/order-types",
          title: "Market, Limit, Stop, and Stop-Limit Orders",
          objectives: [
            "Distinguish market, limit, stop, and stop-limit orders by what each guarantees and what it does not.",
            "Explain slippage, partial fills, and gaps, and why an order type choice can prevent or cause each.",
          ],
          estimatedMinutes: 15,
          instruction: [
            "A market order guarantees execution, not price — it fills immediately at the best currently available price, which can differ from the last quoted price, especially in fast or thin markets (slippage). A limit order guarantees price (at or better than your limit), not execution — it may not fill at all, or may fill only partially if there isn't enough size at your price (a partial fill).",
            "A stop order becomes a market order once a trigger price is touched — useful for automated risk exits, but it inherits the market order's 'guarantees execution, not price' behavior at the worst possible moment: a sharp move or overnight gap can trigger it well past your intended stop price. A stop-limit order becomes a limit order at the trigger, which caps how much worse your fill can be, but reintroduces the 'may not fill at all' risk if price gaps straight through your limit.",
            "A gap is when price opens materially away from its prior close, with no trades in between — common after overnight news or earnings. No order type eliminates gap risk entirely; understanding it is what lets you size and plan around it instead of being surprised by it.",
          ],
          application:
            "For a stock you might buy near its current price, decide which order type you would use to enter, and separately which you would use for your stop-loss exit. State one reason for each choice.",
          quiz: [
            q(
              "A market order guarantees:",
              ["Price", "Execution", "Both price and execution", "Neither"],
              1,
            ),
            q(
              "A stop-limit order, compared to a plain stop order, trades away 'guaranteed execution once triggered' in exchange for:",
              ["Faster fills", "A price cap on the eventual fill", "Lower commissions", "No slippage ever"],
              1,
            ),
            q(
              "A gap is best defined as:",
              ["Any price move over 1%", "Price opening materially away from the prior close with no trades between", "A limit order that didn't fill", "A stop order triggering"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-2/mechanics/entry-confirmation",
          title: "Entry Trigger, Invalidation, Stop, and Targets",
          objectives: [
            "Distinguish entry trigger from invalidation/stop, take-profit-1, and master target.",
            "Explain why an entry should not be taken before its trigger condition actually occurs.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "Four distinct price levels govern a disciplined trade, and confusing them is one of the most common process failures: the entry trigger is the specific, observable condition (a level breaking, a bar confirming) that must actually happen before you act — not a price you expect to happen. Invalidation/stop is the level where the original thesis is proven wrong and risk is capped; it is decided before entry, not adjusted emotionally after. Take-profit-1 is a partial-exit level that locks in progress and often lets you move your stop to breakeven. The master target is the full-thesis level, reached only if the setup plays out completely.",
            "Acting before the entry trigger confirms — 'front-running' your own plan because price looks like it's about to do what you expect — removes the very discipline that separates a trade from a guess, and is one of the most common ways a good idea becomes a bad trade.",
            "This lesson maps directly onto GSPS's own entry-confirmation lifecycle: the platform will not treat a setup as confirmed until its trigger condition has actually occurred, for the same reason taught here.",
          ],
          application:
            "For a hypothetical setup, write out all four levels (entry trigger, invalidation/stop, take-profit-1, master target) in the correct order relative to each other for a long position.",
          quiz: [
            q(
              "The entry trigger is:",
              ["A price you expect will happen", "An observable condition that must actually occur before acting", "The same thing as the stop", "Always the same as the master target"],
              1,
            ),
            q(
              "Acting before an entry trigger confirms is best described as:",
              ["Disciplined anticipation", "Front-running your own plan", "Standard GSPS practice", "Risk-free"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 3 — Capital Preservation (Foundations, Novice, required)
// ---------------------------------------------------------------------------
const ACADEMY_3: Academy = {
  id: "academy-3",
  slug: "capital-preservation",
  number: 3,
  title: "Capital Preservation",
  outcome: "Size positions from risk, not conviction, and complete a validated paper-trading period.",
  programIds: ["foundations"],
  gateStatus: "required",
  prerequisiteAcademyIds: ["academy-2"],
  courses: [
    {
      id: "academy-3/preservation",
      slug: "preservation",
      title: "Risk-Defined Position Sizing",
      outcome: "Build a personal risk constitution and size every position from defined risk, in R-multiples.",
      lessons: [
        {
          id: "academy-3/preservation/survival-principle",
          title: "The Survival Principle",
          objectives: [
            "State why capital preservation is the precondition for every other trading skill.",
            "Compute the return required to recover from a given percentage drawdown.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "No edge, however real, survives an account that runs out of capital. This is arithmetic, not opinion: a 20% loss requires a 25% gain to recover; a 50% loss requires a 100% gain; a 90% loss requires a 900% gain. Losses compound against you asymmetrically, which is why position sizing — not signal quality — is the first skill this academy teaches.",
            "A risk-defined position size means you decide, before entry, the maximum dollar amount you are willing to lose on this specific trade if your stop is hit — and you size the position so that a stop-out costs that amount, not more.",
            "This is a discipline lesson, not a promise. " + NO_GUARANTEE_DISCLAIMER,
          ],
          application:
            "Compute the recovery return required after a 40% drawdown. Show your work.",
          quiz: [
            q(
              "The gain required to recover from a 50% loss is:",
              ["50%", "75%", "100%", "150%"],
              2,
            ),
            q(
              "A risk-defined position size is decided:",
              ["After the trade, based on how it's going", "Before entry, based on maximum acceptable loss", "By the broker automatically", "Only for options"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-3/preservation/r-multiples",
          title: "R-Multiples and Expectancy",
          objectives: [
            "Define '1R' and express a trade's result as a multiple of R.",
            "Explain how expectancy combines win rate and average R to determine whether a system is worth trading.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "1R is the dollar amount you are risking on a single trade — the distance from entry to stop, multiplied by position size. Expressing every result as a multiple of R (a trade that made twice what it risked is '+2R'; one that hit its stop is '-1R') lets you compare trades of completely different sizes and instruments on one consistent scale.",
            "Expectancy = (win rate × average winning R) − (loss rate × average losing R). A system can be profitable with a win rate under 50% if average wins are large relative to average losses, and can be unprofitable with a win rate over 50% if losses are large relative to wins. Win rate alone tells you almost nothing about whether a system is worth trading.",
            "Journaling every trade's R-multiple, not just its dollar P&L, is what makes expectancy measurable over time instead of a guess.",
          ],
          application:
            "A trade risked $200 and closed at +$500 profit. State its R-multiple.",
          quiz: [
            q(
              "1R is defined as:",
              ["Always $100", "The dollar amount risked on that specific trade", "The account's total balance", "A fixed percentage of 2%"],
              1,
            ),
            q(
              "A system with a 40% win rate can still be profitable if:",
              ["It never happens", "Average winning R is large relative to average losing R", "Win rate is the only factor that matters", "Losses are ignored"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-3/preservation/risk-constitution-lab",
          title: "Risk Constitution Lab",
          objectives: [
            "Draft a personal risk constitution: max risk per trade, max daily loss, max concurrent positions, and pause conditions.",
            "Submit a Signal / Bull / Bear / Operator's Decision analysis for one hypothetical setup, sized against your own constitution.",
          ],
          estimatedMinutes: 20,
          instruction: [
            "A risk constitution is a small set of limits you write down before you need them, specifically so a losing streak or an exciting setup can't talk you out of them in the moment: maximum risk per trade (as a percent of account), maximum daily loss before you stop trading for the day, maximum number of concurrent open positions, and explicit pause conditions (e.g. 'three losing trades in a row: stop and review, don't take a fourth').",
            "This lab is where the Three-Element Method becomes concrete for the first time: Signal (what you observe), Bull Case (the opportunity, if any), Bear Challenge (what would prove it wrong, and what the loss costs against your own constitution), and the Operator's Decision (the actual choice — No Trade / Watchlist / Conditional Entry / Reduced-Risk Entry / Standard-Risk Entry / Exit / Review Required).",
            "A well-reasoned 'No Trade' is scored identically to a well-reasoned entry — this lab never rewards trading activity for its own sake.",
          ],
          application:
            "Complete the risk-constitution form and the Bull/Bear/Operator activity attached to this lesson (in the lesson player, not this text) before continuing.",
          quiz: [
            q(
              "A well-reasoned 'No Trade' decision, relative to a well-reasoned entry, is scored:",
              ["Lower, since no action was taken", "Higher, since it avoided risk", "The same — quality of reasoning is what's scored, not activity", "Not scored at all"],
              2,
            ),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: false, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-3/preservation/paper-validation",
          title: "Paper-Trading Validation",
          objectives: [
            "State what a paper-trading validation period does and does not prove.",
            "Identify at least two known limitations of paper trading versus live execution.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Paper trading lets you rehearse process — order entry, sizing discipline, stop discipline, journaling — with no capital at risk. It is a necessary rehearsal, not a guarantee of live results.",
            "Known limitations: paper fills often assume perfect execution at the quoted price, understating real slippage and partial fills; there is no real emotional pressure from actual capital at risk, which is one of the primary sources of undisciplined live decisions; and paper accounts don't experience real account-level constraints like margin calls or pattern-day-trader rules.",
            "Completing a validated paper-trading period, alongside the rest of Academy 3, is what writes practice_validation_completed_at — a separate, additive input to Pro-eligibility from education_completed_at, not a substitute for it.",
          ],
          application:
            "Name one behavior you expect to be harder to maintain with real capital than in paper trading, and why.",
          quiz: [
            q(
              "Which of these is a known limitation of paper trading versus live trading?",
              ["Paper trading has more slippage", "Paper trading understates real slippage and has no real emotional pressure", "Paper trading is more realistic than live trading", "There are no limitations"],
              1,
            ),
            q(
              "Completing Academy 3's paper-trading requirement writes:",
              ["education_completed_at only", "practice_validation_completed_at, separately from education_completed_at", "wall_street_school_completed_at", "school_completed_at"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 4 — Technical Analysis (Sharpening the Edge, Pro, advisory)
// ---------------------------------------------------------------------------
const ACADEMY_4: Academy = {
  id: "academy-4",
  slug: "technical-analysis",
  number: 4,
  title: "Technical Analysis",
  outcome: "Read price structure, multi-timeframe context, and GSPS's reversal/continuation pattern family well enough to annotate a chart with a defensible thesis.",
  programIds: ["sharpening-the-edge"],
  gateStatus: "advisory",
  prerequisiteAcademyIds: ["academy-3"],
  courses: [
    {
      id: "academy-4/structure",
      slug: "price-structure",
      title: "Price Structure and Reversal/Continuation Patterns",
      outcome: "Identify trend, range, transition, and the bar-sequence reversal/continuation patterns GSPS already detects.",
      lessons: [
        {
          id: "academy-4/structure/trend-range-transition",
          title: "Trend, Range, and Transition",
          objectives: [
            "Distinguish trending, ranging, and transitional price structure.",
            "Explain why the same pattern can mean different things depending on which structure it appears in.",
          ],
          estimatedMinutes: 14,
          instruction: [
            "Trending structure makes a series of higher highs and higher lows (uptrend) or lower highs and lower lows (downtrend). Ranging structure oscillates between a defined support and resistance with no persistent directional bias. Transitional structure is the in-between state where the market is testing whether a range will break into a trend, or a trend will stall into a range.",
            "Support and resistance are price levels where supply and demand have historically been dense enough to pause or reverse price; volume and volatility context (is participation rising or falling into a level) helps judge whether a level is likely to hold or fail.",
            "A breakout is a move through a structural boundary; a failed move (or 'fakeout') is a breakout that reverses back inside the boundary shortly after. Multi-timeframe context — checking whether a shorter-timeframe signal agrees or conflicts with the higher-timeframe structure — is what separates a high-conviction read from a coin flip.",
          ],
          application:
            "Pick a chart you're familiar with. Classify its current structure as trending, ranging, or transitional, and name the timeframe you used.",
          quiz: [
            q(
              "An uptrend is defined by:",
              ["Rising volume only", "A series of higher highs and higher lows", "Any green candle", "Price above the 50-day average"],
              1,
            ),
            q(
              "A failed move is:",
              ["A breakout that continues", "A breakout that reverses back inside the boundary shortly after", "Any red candle", "A stop-loss being hit"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-4/structure/strat-fundamentals",
          title: "Reversal and Continuation Pattern Fundamentals",
          objectives: [
            "Name the six bar-sequence reversal/continuation patterns GSPS detects and what each one bets on.",
            "Explain the difference between the failed-push reversal family and the continuation family.",
          ],
          estimatedMinutes: 15,
          instruction: [
            "GSPS's own pattern detector implements six named bar-sequence setups, and this lesson reuses their real, already-shipped explanations rather than inventing new ones: the failed-push reversal, the compressed reversal, the two-sided reversal, the pause continuation, the undecided breakout (direction-neutral until one side fires), and the momentum-exhaustion reversal (after five or more consecutive same-direction bars).",
            "The 2-2 family (2-2, 1-2-2, 3-2-2) all bet on a reversal: the last bar's push failed and the crowd behind it is trapped, so price is expected to break back through the bar's opposite extreme. The 2-1-2 pattern is the opposite job — a continuation, not a reversal — so confusing the two families is the most common misread.",
            "None of these patterns are a guarantee. Confidence scales with the setup bar context (compressed vs. two-sided vs. plain) and with GSPS's own score and structural-level context — never from the bar shape alone.",
          ],
          application:
            "Explain in one sentence why mixing up the 2-1-2 pattern with the 2-2 family would produce the opposite trading decision from what's intended.",
          quiz: [
            q(
              "Which bar-sequence pattern is a continuation setup, not a reversal setup?",
              ["2-2", "1-2-2", "2-1-2", "3-2-2"],
              2,
            ),
            q(
              "The 3-1-2 pattern is:",
              ["Always bullish", "Always bearish", "Direction-neutral until one side triggers", "Not detected by GSPS"],
              2,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-4/structure/chart-annotation-lab",
          title: "Chart Annotation Lab",
          objectives: [
            "Annotate a chart with structure, a Bull case, a Bear challenge, and an Operator's Decision.",
          ],
          estimatedMinutes: 20,
          instruction: [
            "This lab applies the Three-Element Method to a real or hypothetical chart: identify the Signal (instrument, timeframe, structure, evidence, uncertainty), write the evidence-based Bull Case, write the falsifying Bear Challenge (it must reference something specific from the Bull case or Signal — a generic disclaimer does not pass), and submit an Operator's Decision.",
            "This activity is advisory for Pro/Expert — it is saved and shown in your progress, but it never blocks a purchase or promotion decision.",
          ],
          application: "Complete the chart-annotation activity in the lesson player.",
          quiz: [
            q(
              "For Pro-tier learners, this lab's completion is:",
              ["Required for Pro purchase", "Advisory only — saved, never blocking", "Required for promotion to Expert", "Not tracked at all"],
              1,
            ),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: true, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 5 — Fundamental & Macro Research (Pro + Expert, advisory)
// ---------------------------------------------------------------------------
const ACADEMY_5: Academy = {
  id: "academy-5",
  slug: "fundamental-macro-research",
  number: 5,
  title: "Fundamental & Macro Research",
  outcome: "Read a business's fundamentals and macro context well enough to write a defensible one-page research memo.",
  programIds: ["sharpening-the-edge", "professional-toolkit"],
  gateStatus: "advisory",
  prerequisiteAcademyIds: ["academy-4"],
  courses: [
    {
      id: "academy-5/research",
      slug: "research",
      title: "Fundamentals, Macro, and Execution-Score Literacy",
      outcome: "Connect business fundamentals and macro catalysts to a disciplined entry, and read GSPS's execution score honestly.",
      lessons: [
        {
          id: "academy-5/research/fundamentals-and-catalysts",
          title: "Business Fundamentals and Catalysts",
          objectives: [
            "Name the core components of a business's financial statements relevant to a trading thesis.",
            "Identify a scheduled catalyst and a liquidity/event disqualifier.",
          ],
          estimatedMinutes: 14,
          instruction: [
            "Revenue, earnings, margins, and guidance form the core of what markets react to on a quarterly cadence. Valuation (price relative to earnings, growth, or peers) frames whether a move is 're-rating' a business's worth or just noise. Interest rates, inflation, and sector rotation set the macro backdrop every individual name trades within.",
            "A catalyst is a scheduled or anticipated event (earnings, an economic release, a product event) that concentrates uncertainty and often volatility around a specific date. A liquidity/event disqualifier is a reason to skip a trade entirely regardless of setup quality — e.g. a name with abnormally thin volume, or a position you'd be forced to hold through an unpredictable binary event you have no edge in.",
            "Recognizing a disqualifier and choosing 'No Trade' is itself a research skill, not a failure to find a trade.",
          ],
          application:
            "Name one scheduled catalyst type (e.g. earnings, Fed decision) and explain why it would concentrate risk around a specific date.",
          quiz: [
            q(
              "A liquidity/event disqualifier is best described as:",
              ["A reason a setup looks attractive", "A reason to skip a trade regardless of setup quality", "Only relevant to options", "A synonym for a stop-loss"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-5/research/execution-score-literacy",
          title: "Execution Score Literacy",
          objectives: [
            "Explain what GSPS's execution score currently measures directly, and what it currently credits by default.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "GSPS's execution score (lib/risk/execution-score.ts, fed by lib/promotion/readiness.ts) currently measures stop discipline and position sizing directly from your recorded paper-trading history. Four other factors it scores — entry discipline, exit-plan adherence, frequency discipline, and correlation discipline, plus journal completion — are currently given full credit by default, not measured, because GSPS does not yet record the underlying data for them.",
            "This is disclosed here, plainly, rather than implied: a score that looks uniform is not uniformly measured. Treat any factor not explicitly labeled Measured in your /school/progress view as not yet independently verified.",
            "This is the metric-provenance rule that applies everywhere in GSPS School — every number is labeled Measured, Learner-reported, or Planned, and a Planned number is never shown as if it were live enforcement.",
          ],
          application:
            "List which execution-score factors are currently Measured versus given default credit, from this lesson's instruction.",
          metricsShown: [
            { label: "Stop adherence ratio", provenance: "measured" },
            { label: "Position-size compliance ratio", provenance: "measured" },
            { label: "Entry discipline, exit-plan adherence, frequency discipline, correlation discipline, journal completion", provenance: "planned" },
          ],
          quiz: [
            q(
              "Which two execution-score factors are currently measured directly from recorded trading history?",
              ["Journal completion and frequency discipline", "Stop discipline and position sizing", "Entry discipline and correlation discipline", "None — all are placeholders"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 6 — Trading Systems (Expert + Wall Street, mixed gate status)
// ---------------------------------------------------------------------------
const ACADEMY_6: Academy = {
  id: "academy-6",
  slug: "trading-systems",
  number: 6,
  title: "Trading Systems",
  outcome: "Turn a discretionary observation into a written, testable rule set, and understand backtest limitations honestly.",
  programIds: ["professional-toolkit", "systemization-capital-stewardship"],
  // Advisory for Expert, required for Wall Street — gateStatus reflects the
  // stricter requirement; lib/school/gates.ts only enforces the Wall Street
  // consequence, never blocks Expert purchase from this flag alone.
  gateStatus: "required",
  prerequisiteAcademyIds: ["academy-5"],
  courses: [
    {
      id: "academy-6/systems",
      slug: "systems",
      title: "From Observation to Rule",
      outcome: "Write a rule-based playbook entry and understand look-ahead bias and overfitting well enough to avoid them.",
      lessons: [
        {
          id: "academy-6/systems/rules-and-bias",
          title: "Rules, Backtest Limitations, and Look-Ahead Bias",
          objectives: [
            "Define look-ahead bias and overfitting in plain language.",
            "Explain why a backtest's edge estimate should be discounted, not trusted at face value.",
          ],
          estimatedMinutes: 14,
          instruction: [
            "A trading rule is a written, specific, testable condition — not a vague feeling. 'Buy strength' is not a rule; 'enter on a confirmed break of the prior swing high with volume above its 20-bar average' is.",
            "Look-ahead bias is using information in a backtest that would not actually have been available at the moment of the simulated decision — the single most common way a backtest overstates an edge that doesn't exist live. Overfitting is tuning a rule's parameters so precisely to historical data that it captures noise specific to that history rather than a persistent, repeatable edge; an overfit system typically performs far worse on data it wasn't tuned on.",
            "GSPS's own backtest/replay tooling is subject to both risks like any other. Treat every backtest result as an upper bound on plausible edge, subject to real slippage, real execution friction, and the live market's tendency to differ from history — never as a promised return.",
          ],
          application: "Rewrite a vague trading idea ('buy the dip') as a specific, testable rule.",
          quiz: [
            q(
              "Look-ahead bias is:",
              ["Using information that wouldn't have been available at the simulated decision point", "A synonym for overfitting", "A benefit of backtesting", "Only relevant to options"],
              0,
            ),
            q(
              "An overfit system typically:",
              ["Performs consistently everywhere", "Performs far worse on data it wasn't tuned on", "Has no parameters", "Cannot be backtested"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/systems/playbook-lab",
          title: "Trading Playbook Lab",
          objectives: [
            "Write one complete playbook entry: entry rule, exit rule, invalidation, and expectancy hypothesis.",
          ],
          estimatedMinutes: 20,
          instruction: [
            "A playbook entry documents one repeatable setup completely enough that another disciplined trader could execute it the same way you would, without asking you a clarifying question.",
            "Automation concepts referenced here are plan-scoped only — this lab produces a written playbook entry, not a live automated order. GSPS's real automation surface resolves order construction server-side; nothing built in School touches that path.",
          ],
          application: "Complete the playbook-entry form in the lesson player.",
          quiz: [
            q(
              "This lab's automation discussion is:",
              ["A live order-construction workflow", "Plan-scoped concept only, never touching real order construction", "Only for Wall Street", "Not connected to any lab"],
              1,
            ),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: false, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 7 — Derivatives & Portfolio Construction (Expert, advisory)
// ---------------------------------------------------------------------------
const ACADEMY_7: Academy = {
  id: "academy-7",
  slug: "derivatives-portfolio-construction",
  number: 7,
  title: "Derivatives & Portfolio Construction",
  outcome: "Understand portfolio exposure, correlation, hedging concepts, and other asset classes as literacy only — never as GSPS execution workflows.",
  programIds: ["professional-toolkit"],
  gateStatus: "advisory",
  prerequisiteAcademyIds: ["academy-6"],
  courses: [
    {
      id: "academy-7/portfolio",
      slug: "portfolio",
      title: "Exposure, Correlation, and Conceptual Literacy",
      outcome: "Reason about portfolio-level risk and understand options/futures/forex/crypto/commodities conceptually.",
      lessons: [
        {
          id: "academy-7/portfolio/exposure-and-correlation",
          title: "Portfolio Exposure and Correlation",
          objectives: [
            "Explain why two uncorrelated positions reduce portfolio risk more than two correlated ones of the same size.",
            "Identify a diversification limit (holding many correlated names is not real diversification).",
          ],
          estimatedMinutes: 12,
          instruction: [
            "Portfolio-level risk depends not just on how large each position is, but on how positions move together. Five positions in the same sector, all reacting to the same macro driver, behave more like one large position than five independent ones — this is a diversification limit, not diversification.",
            "Correlation is not fixed — it tends to rise toward 1 during sharp market-wide selloffs, exactly when diversification benefit is needed most. This is a known, real limitation to plan around, not a reason to abandon diversification.",
          ],
          application: "Name two positions you could hold that would likely be genuinely uncorrelated, and explain why.",
          quiz: [
            q(
              "Five positions in the same sector reacting to the same macro driver behave most like:",
              ["Five independent bets", "One large position", "A hedge", "Guaranteed diversification"],
              1,
            ),
            q(
              "Correlation between assets during sharp market-wide selloffs tends to:",
              ["Fall toward zero", "Rise toward 1", "Stay perfectly constant", "Become negative"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-7/portfolio/conceptual-literacy",
          title: "Options, Futures, Forex, Crypto, and Commodities — Conceptual Literacy Only",
          objectives: [
            "State GSPS's actual execution scope and why this lesson is conceptual literacy, not an executable workflow.",
            "Describe hedging and short-selling risk at a conceptual level.",
          ],
          estimatedMinutes: 14,
          instruction: [
            "GSPS executes and scans U.S. equities only. This lesson exists so a learner has working vocabulary for options, futures, forex, crypto, and commodities when they encounter them elsewhere — it is explicitly not a GSPS-executable workflow, and nothing in this lesson or lab constructs an order in any of these instruments.",
            "Options carry defined-risk (long option) and undefined-risk (short/naked option) variants — the distinction matters enormously and is a common source of catastrophic, unplanned loss when misunderstood. Futures and forex trade on margin with leverage that can amplify losses beyond the initial capital committed. Short-selling carries theoretically unlimited loss potential, since a shorted asset's price has no upper bound.",
            "Hedging, conceptually, is taking an offsetting position to reduce (not eliminate) risk on an existing position — a real technique used by professionals, and conceptually useful to understand even where GSPS does not execute the hedge itself.",
          ],
          application:
            "In your own words, explain why short-selling's loss potential is structurally different from a long position's loss potential.",
          quiz: [
            q(
              "GSPS's actual execution scope is:",
              ["U.S. equities, options, and futures", "U.S. equities only", "Global multi-asset including crypto", "Forex and commodities only"],
              1,
            ),
            q(
              "A short position's loss potential is:",
              ["Capped at 100% of the position", "Theoretically unlimited, since price has no upper bound", "Always smaller than a long position's", "Eliminated by a stop order"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Academy 8 — Professional Desk Simulation (Wall Street, required before checkout)
// ---------------------------------------------------------------------------
export const WALL_STREET_CAPSTONE_COURSE_ID = "academy-8/capstone";
export const WALL_STREET_W2_COURSE_ID = "academy-8/w2-live-capital-recertification";

const ACADEMY_8: Academy = {
  id: "academy-8",
  slug: "professional-desk-simulation",
  number: 8,
  title: "Professional Desk Simulation",
  outcome:
    "Run a full daily desk cycle — preparation, thesis, trade-plan, execution monitoring, review — and complete the Wall Street capstone dossier. Includes the existing live-capital re-certification pilot as Course W2.",
  programIds: ["systemization-capital-stewardship"],
  gateStatus: "required",
  prerequisiteAcademyIds: ["academy-6"],
  courses: [
    {
      id: WALL_STREET_CAPSTONE_COURSE_ID,
      slug: "capstone",
      title: "Capstone: Investment-Committee Dossier",
      outcome:
        "Complete daily-preparation, trade-plan, and weekly-attribution labs, then submit a capstone dossier synthesizing the whole method. Passing this course (not W2) writes wall_street_school_completed_at.",
      lessons: [
        {
          id: "academy-8/capstone/daily-desk-cycle",
          title: "The Daily Desk Cycle",
          objectives: [
            "Name the five stages of a professional daily desk cycle.",
            "Explain why end-of-day review is a required stage, not optional.",
          ],
          estimatedMinutes: 14,
          instruction: [
            "A professional desk cycle runs, every trading day: pre-market preparation (market-state review, watchlist conditions, known catalysts), research-thesis refinement, trade-plan construction (entry, invalidation, targets, size), execution monitoring against the plan, and end-of-day review (what happened, did you follow the plan, what's the process lesson).",
            "End-of-day review is not optional because it's the only stage that converts a single day's outcome into a durable process improvement — skipping it means every day starts from the same base rate of mistakes as the last.",
          ],
          application: "List the five stages of the daily desk cycle in order, from this lesson's instruction.",
          quiz: [
            q(
              "End-of-day review is required because:",
              ["It predicts tomorrow's price", "It's the stage that converts outcomes into durable process improvement", "It's a regulatory requirement", "It replaces the trade plan"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-8/capstone/weekly-attribution",
          title: "Weekly Attribution and Plan Refinement",
          objectives: [
            "Explain what performance attribution is and what GSPS can currently support versus what remains learner-reported.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "Weekly attribution asks: which decisions drove this week's result — sizing, entry timing, exit discipline, or something outside your control (market regime)? GSPS supports attribution partially: closed-trade P&L, stop adherence, and position-size compliance are measured from recorded history; classifying *why* a given trade deviated from plan is learner-reported, since GSPS does not yet record intent.",
            "Repeated-error-pattern recognition (the same mistake across multiple weeks) is the highest-value output of this cadence — see the Cadence Engine reference on /school/progress for how this maps to your gate consequences.",
          ],
          application: "Identify one repeated error pattern (real or hypothetical) you would look for across a week of trades.",
          metricsShown: [
            { label: "Closed-trade P&L, stop adherence, position-size compliance", provenance: "measured" },
            { label: "Reason a trade deviated from plan", provenance: "learner_reported" },
          ],
          quiz: [
            q(
              "Classifying *why* a trade deviated from plan is currently:",
              ["Measured automatically by GSPS", "Learner-reported", "Impossible to record", "Only available to Novice tier"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-8/capstone/capstone-dossier",
          title: "Capstone Dossier: Investment-Committee Presentation",
          objectives: [
            "Submit a capstone dossier: Signal, Bull case, Bear challenge, and Operator's Decision for a complete trade-plan, framed as a presentation to an investment committee.",
          ],
          estimatedMinutes: 30,
          instruction: [
            "This is the terminal assessment for pre-purchase Wall Street readiness. It requires a complete, non-trivial Three-Element Method submission — the Bear case must reference something specific from the Bull case or Signal (a generic disclaimer does not pass), and the Operator's Decision must state a next observable condition, a risk action, and a reversal condition.",
            "Passing this dossier — not Course W2 — is what writes live_trading_restrictions.wall_street_school_completed_at, which the Wall Street checkout route requires server-side before allowing a SYSTEM_MASTERY purchase.",
            "This dossier is simulation/hypothetical-based. " + NO_GUARANTEE_DISCLAIMER,
          ],
          application: "Complete the capstone dossier lab in the lesson player.",
          quiz: [
            q(
              "Passing this capstone dossier writes:",
              ["school_completed_at", "wall_street_school_completed_at", "education_completed_at", "practice_validation_completed_at"],
              1,
            ),
            q(
              "A Bear case consisting only of a generic risk disclaimer:",
              ["Passes automatically", "Does not pass — it must reference something specific from the Bull case or Signal", "Is not required at all", "Only matters for Novice tier"],
              1,
            ),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: true, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
      ],
    },
    {
      // The existing pilot, retained unchanged, placed here as Course W2.
      // Its lessons/quiz/service-layer stay entirely in lib/school/content.ts
      // and lib/school/service.ts — this entry exists only so the learner-
      // facing curriculum map can show it in context. It is never read from
      // here for grading or gate-writing.
      id: WALL_STREET_W2_COURSE_ID,
      slug: "w2-live-capital-recertification",
      title: "Course W2: Live-Trading Risk Re-Certification",
      outcome:
        "The existing live-capital/loss-cascade/stop-override re-certification pilot — unchanged. Required only after a 50% live-loss restriction, not for initial Wall Street purchase.",
      lessons: [],
    },
  ],
};

export const ACADEMIES: readonly Academy[] = [
  ACADEMY_1,
  ACADEMY_2,
  ACADEMY_3,
  ACADEMY_4,
  ACADEMY_5,
  ACADEMY_6,
  ACADEMY_7,
  ACADEMY_8,
] as const;

export function getAcademy(idOrSlug: string): Academy | undefined {
  return ACADEMIES.find((a) => a.id === idOrSlug || a.slug === idOrSlug);
}

export function getCourse(courseId: string): { academy: Academy; course: CurriculumCourse } | undefined {
  for (const academy of ACADEMIES) {
    const course = academy.courses.find((c) => c.id === courseId || c.slug === courseId);
    if (course) return { academy, course };
  }
  return undefined;
}

export function getCourseBySlug(academySlug: string, courseSlug: string) {
  const academy = getAcademy(academySlug);
  if (!academy) return undefined;
  const course = academy.courses.find((c) => c.slug === courseSlug);
  if (!course) return undefined;
  return { academy, course };
}

export function getLesson(lessonId: string): { academy: Academy; course: CurriculumCourse; lesson: CurriculumLesson } | undefined {
  for (const academy of ACADEMIES) {
    for (const course of academy.courses) {
      const lesson = course.lessons.find((l) => l.id === lessonId);
      if (lesson) return { academy, course, lesson };
    }
  }
  return undefined;
}

export function allCurriculumLessons(): readonly CurriculumLesson[] {
  return ACADEMIES.flatMap((a) => a.courses.flatMap((c) => c.lessons));
}

/** Academies (by id) that count toward Foundations — the only gate-relevant set for Novice writes. */
export const FOUNDATIONS_ACADEMY_IDS = ACADEMIES.filter((a) => a.programIds.includes("foundations")).map((a) => a.id);

/** Lessons across Academies 1-3 whose collective completion is required for education_completed_at. */
export function foundationsEducationLessons(): readonly CurriculumLesson[] {
  return ACADEMIES.filter((a) => FOUNDATIONS_ACADEMY_IDS.includes(a.id))
    .flatMap((a) => a.courses.flatMap((c) => c.lessons))
    .filter((l) => l.id !== "academy-3/preservation/paper-validation");
}

/** The one lesson whose completion represents the validated paper-trading requirement. */
export const PAPER_VALIDATION_LESSON_ID = "academy-3/preservation/paper-validation";

/** Lessons in the Wall Street capstone course (Academy 8, non-W2) required for wall_street_school_completed_at. */
export function wallStreetCapstoneLessons(): readonly CurriculumLesson[] {
  const course = ACADEMY_8.courses.find((c) => c.id === WALL_STREET_CAPSTONE_COURSE_ID);
  return course?.lessons ?? [];
}
