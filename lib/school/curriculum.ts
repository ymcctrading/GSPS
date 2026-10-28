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

import { NO_GUARANTEE_DISCLAIMER } from "@/lib/school/disclaimer";
import { SELL_SETUP_LESSON_ID } from "@/lib/education/sellSetupHelp";
import type { PlatformTier } from "@/lib/tiers";
import type { QuizQuestion } from "@/lib/school/content";

export const SCHOOL_CURRICULUM_PROGRAM_ID = "gsps-school-curriculum";
export const CURRICULUM_VERSION = "2026.09.1";

/** Every lesson requiring "no guarantee of outcome" language carries this exact disclaimer (`./disclaimer`). */
export { NO_GUARANTEE_DISCLAIMER };

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
  /**
   * Reading, not a gate: an optional lesson never counts toward an academy's
   * completion, its prerequisites or a promotion path, and opens without the
   * lesson before it. Added 2026-10-28 for the sell setup lesson, so adding it
   * relocked no learner's later academies.
   */
  optional?: true;
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
            "Picture a busy farmers' market. Nobody posts an official price for tomatoes; the price settles wherever buyers and sellers agree, and it changes as the morning goes on. A stock market works the same way, only with shares of companies (small pieces of ownership) instead of tomatoes, and with millions of buyers and sellers instead of a few dozen.",
            "A public market exists to do two things: discover a price that reflects everyone's current information and willingness to trade (called price discovery), and route money toward the companies people collectively judge most worthwhile (called capital allocation: a growing company can raise money by selling new shares, and a well-priced stock makes that easier). Neither function works without disagreement — a market where everyone agreed on fair value would have no trades, because a trade requires a buyer who thinks the price is fair-or-better and a seller who thinks the same in the opposite direction.",
            "Price discovery is continuous, not a single event. Every trade is one data point in a running estimate that never finishes updating, because new information never stops arriving: earnings (the profit a company reports each quarter), macro data (news about the whole economy, such as jobs or inflation), sentiment shifts (changes in the crowd's mood) and order flow (the stream of buy and sell orders itself).",
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
            "Think of the same busy market again. Some shoppers are buying dinner, a restaurant buys in bulk every Monday whatever the price, and a stall-holder buys from one farmer to resell to the next customer. They all trade the same tomatoes for different reasons. Markets are full of these different reasons, and knowing them helps explain moves that look strange on a chart.",
            "Retail investors (individuals trading their own money), market makers, institutional asset managers, algorithmic or systematic traders (computer programs trading on fixed rules), and corporate insiders (a company's own executives and directors, who must report their trades) all trade the same securities (stocks and similar investments) for different reasons. A market maker is like that stall-holder: a firm that always stands ready to buy and to sell (called providing liquidity: making it easy for others to trade quickly), earning the small gap between its buying and selling price. It cares about not getting stuck with too many shares (inventory risk), not about where the price goes next. An institutional manager (a pension fund, mutual fund or insurer investing other people's money) may have to rebalance on a schedule, buying or selling to get back to its target mix, regardless of its view on price. A retail trader has no rulebook from clients telling them what they must hold (a mandate), but also no risk department forcing them to cap their losses, the controls larger firms are required to run. That freedom cuts both ways.",
            "None of these incentives are visible directly in a price chart — but they explain patterns you will see repeatedly: end-of-quarter rebalancing flows, bigger swings on the days options contracts expire (an option is a contract to buy or sell a stock at a set price by a set date), and fewer willing traders around scheduled news.",
            "GSPS scope: this platform scans and charts U.S. stocks and funds (including funds that hold commodity and currency futures) and crypto, and places trades in U.S. stocks, funds and crypto, with options on paper only. Futures and forex show live quotes only for now. Every participant discussion in this academy is grounded in the U.S. stock market, not futures, forex, or crypto market structure.",
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
              "Which markets can you place trades in on GSPS?",
              ["Every market in the world", "U.S. stocks, funds and crypto (options on paper only)", "Futures and forex only", "Crypto only"],
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
            "Think of the difference between a professional poker player and someone feeding a slot machine. Both can win or lose on a given night, but the poker player follows rules about which hands to play and how much to bet, and can review afterwards what they did. The slot player has no rules that change the odds. That difference, a repeatable process you can check, is what this lesson is about.",
            "These four words get used interchangeably but describe different processes. Investing puts money into a company because of how its business is doing (its fundamentals: sales, profits, debts) and holds it for years. Trading takes a position (buys or sells shares) based on a defined, risk-managed thesis, meaning a clear reason with the possible loss decided in advance, over a shorter horizon (days to weeks rather than years) with an explicit exit plan. Speculation bets on which way price will move (a directional bet) with limited underlying analysis, often on a shorter horizon, and can be a legitimate, small, clearly-labeled part of a plan. Gambling stakes money on an outcome with no persistent edge (an edge is a reason your choices should win more than chance over many tries) and often no risk-defined exit — the defining failure is not the time horizon, it's the absence of a repeatable, evaluable process.",
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
        {
          // Added 2026-10-28 (owner: a novice asked how to act on a sell
          // setup without owning the stock). In Academy 1 so it is open to a
          // new learner from the first day, the day the Sell list first shows.
          id: SELL_SETUP_LESSON_ID,
          optional: true,
          title: "Trading a Sell Setup When You Don't Own the Stock",
          objectives: [
            "Explain in plain words how a short sale lets you profit from a falling price: borrow, sell now, buy back later, return.",
            "Name the account a short sale needs and why its risk has no ceiling unless you set a stop.",
            "List the other ways to act on a sell setup: a put option, an inverse fund, an exit on shares you own, or passing.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Start with a concert ticket. A friend lends you their ticket while tickets are selling for $100. You sell it for $100. A week later the price drops to $70, so you buy one back for $70 and give it to your friend. You started with nothing and you end with $30. That is a short sale: borrow something, sell it now, buy it back later, and give it back. You make money when the price falls.",
            "Now suppose the price jumps to $150 instead. You still owe your friend a ticket, so you have to buy one at $150, and you lose $50. If it went to $300 you would lose $200. A price can only fall to zero, but it can rise without limit, so a short sale's loss has no ceiling. That is why a stop loss on a short is not optional: it is the price where you buy back and stop the loss from growing. Even a stop can fill worse than planned if the price jumps past it overnight, so size the trade for that too.",
            "With stocks, your broker is the friend who lends. Shorting needs a margin account (a plain cash account or a retirement account such as an IRA can't short), and many brokers ask for at least $2,000 and an approval step first. The broker charges a borrowing fee for every day you hold the short (small for most stocks, large for hard-to-borrow ones), you pay any dividend the stock pays while you are short, and the broker can ask for the shares back or ask you to add money if the price rises a lot. You can practise a short in your GSPS paper account first, with no real money and no margin account needed.",
            "There are other ways to act on a sell setup. You can buy a put option, which rises in value when the stock falls far enough before the option expires; the most you can lose is what you paid for it, and you lose it if the fall is too small or comes too late. If the sell setup is on the whole market, you can buy an inverse fund, a fund built to rise when the market falls; most track that over a single day, so held for weeks they can drift from it. If you already own the stock, a sell setup is your cue to take profits or tighten your stop. And you can simply pass: many beginners trade only buy setups at first, and that is a perfectly good choice.",
            "One thing people often mix up: a covered call is a different trade. It means selling someone the right to buy shares you already own, in exchange for a small payment now. It earns income on stock you hold, and it gives up any gain above the agreed price; it is not a way to profit from a fall, and it doesn't protect you much if the price drops a lot. " +
              NO_GUARANTEE_DISCLAIMER,
          ],
          application:
            "Explain a short sale to a friend in three sentences using your own everyday example (not the concert ticket). Then name one way you could act on a sell setup without shorting at all.",
          quiz: [
            q(
              "In a short sale, you make money when:",
              ["The price rises", "The price falls", "The price stays the same", "The company pays a dividend"],
              1,
            ),
            q(
              "Why does a short sale need a stop loss?",
              [
                "Brokers don't allow shorts without one",
                "A price can rise without limit, so the loss has no ceiling unless you set where to buy back",
                "It makes the short sale free",
                "It guarantees a profit",
              ],
              1,
            ),
            q(
              "Which account can usually NOT be used to short a stock?",
              ["A margin account", "A cash account or an IRA", "Any account over $2,000", "An approved margin account"],
              1,
            ),
            q(
              "A covered call is best described as:",
              [
                "A way to profit from a falling price",
                "Another name for a short sale",
                "Income from selling the right to buy shares you already own",
                "A put option",
              ],
              2,
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
    {
      // Rewritten 2026-10-28 (owner: the School teaches public methods by
      // others, never the back end's sources). Lesson ids are unchanged so
      // progress and promotion carry over.
      id: "academy-2/simple-rules",
      slug: "simple-rules",
      title: "Simple Rules With Mr. Bull and Mrs. Bear",
      outcome:
        "Explain, in plain words, the handful of ideas every chart reader starts with: which way the trend is, where support and resistance sit, how far a normal pullback goes, and how to keep a loss small.",
      lessons: [
        {
          id: "academy-2/simple-rules/trend-and-levels",
          title: "Which Way Is the Market Going? Dow Theory in Plain Words",
          objectives: [
            "Tell an uptrend from a downtrend by its highs and lows, the way Dow Theory does.",
            "Name the three sizes of trend and explain why the biggest one matters most.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Mr. Bull and Mrs. Bear are your guides through GSPS School. Mr. Bull makes the case for a trade: what could go right. Mrs. Bear challenges it: what could go wrong, and what would prove the idea false. Every good decision hears both of them before it acts.",
            "Dow Theory, one of the oldest ideas in technical analysis, starts with a simple picture. A market going up makes higher highs and higher lows, one after another. A market going down makes lower highs and lower lows. When you can't tell which it is doing, it is going sideways, and sideways is the hardest place to make money.",
            "Dow Theory also says trends come in three sizes, like the tide, the waves and the ripples. The primary trend lasts months to years. Secondary moves run against it for weeks, and most of what people call pullbacks are these. Minor moves last days and are mostly noise. Mr. Bull trades in the direction of the biggest trend he can see, and uses the smaller ones only to time his entry.",
            "Mrs. Bear's first lesson: a trend is assumed to continue until it gives a clear signal that it has ended. Buying in a downtrend because the price 'looks cheap' is how small losses become big ones. Wait for the market to show you it has turned: a higher low, then a break above the last high.",
          ],
          application:
            "Open any chart. Mark the last two highs and the last two lows. Are they rising, falling, or mixed? Say which way the trend is in one sentence, then say what Mrs. Bear would want to see before believing it.",
          quiz: [
            q("An uptrend is a market making:", ["Lower highs and lower lows", "Higher highs and higher lows", "The same high every day", "Big volume every day"], 1),
            q(
              "In Dow Theory, a trend is assumed to continue until:",
              ["The news turns bad", "It gives a clear signal that it has ended", "The end of the month", "Price falls for one day"],
              1,
            ),
            q("Mrs. Bear's job in a decision is to:", ["Agree with Mr. Bull", "Challenge the idea and say what would prove it wrong", "Pick the position size", "Place the order"], 1),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: false, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-2/simple-rules/halfway-and-round-numbers",
          title: "Support, Resistance, the 50% Pullback and Round Numbers",
          objectives: [
            "Explain why old highs and lows act as support and resistance.",
            "Find the 50% point of a move, and explain why prices often stall near round numbers.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Support is a price where buying has stopped a fall before. Resistance is a price where selling has stopped a rise. Old highs and lows are the most common ones, because traders remember them: people who bought at a high and watched it fall are happy to sell when price gets back there. When price finally pushes through resistance, that level often becomes support on the next dip. It works the other way too: broken support often becomes resistance.",
            "Pullbacks in a trend often retrace a share of the move before it carries on. Dow Theory observed that secondary moves usually take back between a third and two thirds of the move before them, and the halfway point, 50%, is the one many traders watch. A market that holds above the halfway point of its last rise is still healthy. One that falls well below it is losing strength.",
            "Round numbers such as 20, 50, 100 or 200 are where many people place their orders, because people think in round numbers. That crowd of orders often stops a rally just under the round number, or a fall just above it.",
            "Mrs. Bear's warning: don't place your own order right on the round number or the old level, where everyone else's is. Place it a little before it. And a level isn't a wall: it is a place to watch how price behaves, not a promise that it will turn.",
          ],
          application:
            "On a chart, find the high and low of the last big move and mark the halfway point. Then mark the nearest old high above today's price and the nearest round number. Which is closer?",
          quiz: [
            q("When price breaks above an old resistance level, that level often:", ["Stops mattering", "Becomes support on the next dip", "Guarantees a new high", "Means the trend is down"], 1),
            q("A pullback that holds above the 50% point of the last rise suggests the move is:", ["Still healthy", "Over", "Certain to make a new high", "Too risky to watch"], 0),
            q(
              "A sensible place for a selling order, when a round number is just above, is:",
              ["Exactly on the round number", "A little before the round number", "Far above it", "Nowhere; round numbers don't matter"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-2/simple-rules/small-losses",
          title: "Cutting Losses Short",
          objectives: [
            "Set a stop before a trade and size the trade from it.",
            "Explain why a small loss is cheap and a large one is expensive.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Mrs. Bear's most important rule: every trade has a stop before it is placed. The stop is the price that says 'I was wrong.' Hoping a losing trade comes back is how accounts get hurt.",
            "Size the trade from the stop, not the other way round. Many traders risk only 1% or 2% of their account on any one trade: the distance from entry to stop, times the number of shares, should come to no more than that. Then a run of losses is a setback, not a disaster.",
            "Losses are harder to win back than they look. Lose 10% and you need about 11% to get back to even. Lose 50% and you need 100%. That is why the first loss is the cheapest one to take.",
            "Never add to a losing trade to 'average down'. If you add at all, add only to a trade that is already working. And after a run of losing trades, step back. Something has changed, the market or your judgment, and a break to review costs less than trading through it. GSPS pauses new entries for a short time after a run of losses, and never blocks you from closing or protecting a trade.",
          ],
          application:
            "Take a $10,000 practice account. If you risk 1% on a trade with the stop $2 below the entry, how many shares is that? Write down your own stop rule and your rule for a losing streak.",
          quiz: [
            q("When should a trade's stop be decided?", ["After it starts losing", "Before the trade is placed", "Never", "At the end of the week"], 1),
            q("A $10,000 account risking 1% with the stop $2 from the entry trades about:", ["5 shares", "50 shares", "500 shares", "5,000 shares"], 1),
            q("After a 50% loss, the gain needed to get back to even is:", ["50%", "75%", "100%", "25%"], 2),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-2/simple-rules/what-a-trader-needs",
          title: "The Trading Plan and the Trading Journal",
          objectives: ["Write a simple trading plan.", "Explain why a journal and fewer, better trades help."],
          estimatedMinutes: 8,
          instruction: [
            "A trading plan answers five questions before any money moves: what market, which way, where in, where out if wrong, and how much. If you can't answer all five, there is no trade yet.",
            "A trading journal records every trade: why you took it, what you planned, what happened and how you felt. Read it back each week. Most traders find their losses come from a few repeated habits, and the journal is how you see them.",
            "Mr. Bull's reminder: fewer, better trades beat many average ones. Trading because you are bored, or to win back a loss, is overtrading, and it is one of the fastest ways to lose.",
            "Mrs. Bear's reminder: after a long winning run, don't suddenly trade bigger. Success makes traders careless.",
          ],
          application: "Write a one-paragraph trading plan for a stock you follow, answering all five questions. Then start a journal page for it.",
          quiz: [
            q("Which of these is NOT one of a trading plan's questions?", ["Where in", "Where out if wrong", "What a friend thinks", "How much"], 2),
            q("Trading to win back a loss is an example of:", ["Good risk control", "Overtrading", "Patience", "Planning"], 1),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-2/simple-rules/the-chart-not-the-news",
          title: "Judge the Market From Its Own Chart",
          objectives: [
            "Explain why the chart, not the headlines, decides a trade.",
            "Use news only to know when risk is higher, not to pick a direction.",
          ],
          estimatedMinutes: 8,
          instruction: [
            "Dow Theory's first idea is that price already reflects what is known. Mrs. Bear's warning follows from it: headlines are written after the move. A story about why a stock jumped is an explanation of yesterday, and by the time you read it, the buying or selling it describes is already in the price.",
            "Mr. Bull's rule: the chart is the record of what people actually did with their money. Highs, lows, the trend and the volume tell you where the market is going more honestly than anyone's opinion about it. If the chart and the news disagree, trust the chart.",
            "Exciting news often arrives near the end of a move, when the last buyers are rushing in, and gloomy news near the end of a fall. Acting on how a story makes you feel is how traders buy near tops and sell near bottoms.",
            "News still has one use: knowing when a scheduled event, such as an earnings report, can make price jump past your stop. That tells you when risk is higher and when to stay out. It does not tell you which way to trade.",
          ],
          application:
            "Find a stock in the headlines today. Before reading the story, write down what its chart says: the trend, the last high and low, and where you would be wrong. Then read the story and ask whether it changes anything the chart told you.",
          quiz: [
            q(
              "A headline says a stock is soaring on great news, but its chart shows lower highs and lower lows. What should guide your decision?",
              ["The headline", "The chart", "Whichever you read first", "A friend's opinion"],
              1,
            ),
            q(
              "The sound use of scheduled news, such as an earnings date, is to:",
              ["Pick which way to trade", "Know when risk is higher and when to stay out", "Remove your stop", "Trade bigger"],
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
            "A risk constitution is a small set of limits you write down before you need them, specifically so a losing streak or an exciting setup can't talk you out of them in the moment: maximum risk per trade (as a percent of account), maximum daily loss before you stop trading for the day, maximum number of concurrent open positions, and explicit pause conditions (e.g. 'after a set number of losing trades in a row: stop and review before the next').",
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

    {
      // Rewritten 2026-10-28 (owner: public methods only; see Academy 2).
      id: "academy-4/reading-the-swings",
      slug: "reading-the-swings",
      title: "Reading the Swings With Mr. Bull and Mrs. Bear",
      outcome:
        "Read a market's swings well enough to check a trade plan: where the breakout level is, where the stop belongs, what a trading range and its volume are saying, and how a winning trade is managed.",
      lessons: [
        {
          id: "academy-4/reading-the-swings/breakouts-and-stops",
          title: "Swing Highs and Lows, Breakouts and Pullbacks",
          objectives: [
            "Mark swing highs and lows and explain why a close past one matters.",
            "Explain the break-and-retest entry and place a stop beyond the level that would prove the idea wrong.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "A swing high is a bar whose high stands above the bars on either side of it; a swing low is the mirror. Joined up, they show the shape of the trend more clearly than every single bar does, and they are the levels traders watch.",
            "A breakout is price leaving a level behind. Mr. Bull wants it on a close, not a brush during the day: many intraday pokes above a high fall back by the close. A close clearly past the last swing high is the market showing the buyers are in control.",
            "He doesn't chase it. A common way to enter is the break-and-retest: after the breakout, wait for price to pull back toward the level it broke, and buy as it holds there. The old resistance has become support. The entry is closer to the level, so the stop can be closer too. The catch: a strong breakout sometimes never comes back, and the trade is missed. That is the price of not chasing.",
            "Mrs. Bear's stop goes just beyond the level the idea depends on: a little under the broken high for a buy, a little over the broken low for a short. If price closes back through it, the breakout has failed, and that is a reason to leave rather than to hope. A stop right on a round number or right on the level is where everyone else's is, so it goes a little beyond.",
            "Mrs. Bear's other warning is the false breakout. A market that pushes over a high and closes straight back under it has trapped the late buyers, and the move the other way can be sharp. One reason GSPS waits for a close, and then a pullback, is to let the false ones show themselves first.",
          ],
          application: "On a chart, mark the last swing high and low. If price closed clearly over that high, where would a break-and-retest buy go, and where would the stop go?",
          quiz: [
            q("A break-and-retest entry buys:", ["At the first intraday poke over the high", "On the pullback toward the level that was broken", "At the next open, whatever the price", "At a round number far above"], 1),
            q("A breakout that closes back under the level it crossed:", ["Is stronger than ever", "Has failed, a reason to leave", "Should be doubled", "Means nothing"], 1),
          ],
          bullBear: { required: true, requiresRegimeCheckpoint: true, scenarioBasis: "hypothetical" },
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-4/reading-the-swings/three-closes-and-volume",
          title: "Trading Ranges and Volume at Turns (Wyckoff)",
          objectives: ["Describe accumulation and distribution ranges the way Wyckoff did.", "Read volume at a bottom and at a top."],
          estimatedMinutes: 12,
          instruction: [
            "Richard Wyckoff, writing a century ago, described markets as moving between trading ranges and trends. Large buyers can't fill a big order in one day without lifting the price, so they buy over weeks inside a range. He called that accumulation. Distribution is the mirror: large holders selling to the public inside a range near a top. The trend that follows a range, up out of accumulation or down out of distribution, he called markup and markdown.",
            "Wyckoff named a few events traders still look for. A selling climax is a sharp fall on very heavy volume that ends a decline, often followed by an automatic rally. A spring is a quick dip under the bottom of a range that snaps back inside it, shaking out weak holders before markup. An upthrust is the mirror at the top of a range, a push over its high that fails.",
            "Volume tells you who is in charge. In Wyckoff's terms, effort (volume) should match result (price movement). A breakout on heavy volume has real effort behind it. A rally to a new high on shrinking volume shows less buying, and Mrs. Bear reads that as a warning. At a bottom, selling that dries up, a retest of the low on lighter volume than the first, is Mr. Bull's sign that the sellers are done.",
            "Mr. Bull's caution: these labels are easy to apply after the fact. Inside a range, nobody knows yet whether it is accumulation or distribution. Let the breakout and its volume tell you.",
          ],
          application: "Find a stock that has gone sideways for several weeks. Mark the top and bottom of the range. Did it leave the range, which way, and on what volume?",
          quiz: [
            q("In Wyckoff's terms, accumulation is:", ["Large buyers buying inside a range before a rise", "A fast rally on no volume", "Selling at a top", "A gap down"], 0),
            q("A retest of a low on lighter volume than the first low is:", ["A sign selling is drying up", "A sign of heavy selling", "Irrelevant", "A sell signal"], 0),
            q("A spring is:", ["A rally to a new high", "A quick dip under a range's bottom that snaps back inside", "A dividend", "A long red candle at a top"], 1),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-4/reading-the-swings/managing-a-winner",
          title: "Trailing Stops and Letting Winners Run",
          objectives: ["Describe the common ways to trail a stop.", "Explain why a winning trade is often better without a fixed target."],
          estimatedMinutes: 11,
          instruction: [
            "'Cut your losses and let your profits run' is one of the oldest sayings on Wall Street. The first half is the stop. The second half is the trailing stop: a stop that moves only in the trade's favour as the trade works.",
            "Traders trail stops a few common ways. Under each new higher swing low, so the trend has to break to stop you out. Under a moving average, or a set multiple of the average daily range behind the best price, so the trail adjusts to how much the stock usually moves. And many move the stop to the entry price once the trade is far enough ahead, so it can no longer become a loss.",
            "A fixed profit target caps a winner. Mrs. Bear's point: you can't know in advance how far a move will run, so let the market tell you when it is over, through a broken swing low or a failed level, instead of guessing a price. GSPS plans show a first target as a level to watch, not as an order that sells there, and the trade runs until its stop or the trend says otherwise.",
            "Mr. Bull's caution: a trail set too tight gets stopped out by ordinary pullbacks. Give a trade room for its normal swings, and tighten only as the move gets old or fast.",
          ],
          application: "Take a trade you know that went well. Where would the stop have been after each higher swing low? Where would that trail have taken you out?",
          quiz: [
            q("Once a trade is far enough ahead, many traders move the stop to:", ["Further away", "The entry price", "Zero", "The first target"], 1),
            q("A stop trailed under each higher swing low takes you out when:", ["It is Friday", "The trend breaks", "Volume rises once", "Price touches a round number"], 1),
          ],
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
    {
      // Rewritten 2026-10-28 (owner: the School teaches public methods by
      // others, Elliott Wave named as the example; never the back end's
      // sources). Ids and slug unchanged so progress carries over.
      id: "academy-6/method-rules",
      slug: "method-rules",
      title: "Advanced Methods: Elliott Wave, Fibonacci, Cycles and Sizing",
      outcome:
        "Read a chart with the advanced public methods experienced traders use (Elliott Wave counts, Fibonacci ratios, market stages and seasonal tendencies) and size and add to positions with discipline, knowing where each method is strong and where it is only opinion.",
      lessons: [
        {
          id: "academy-6/method-rules/swing-charts-and-trend",
          title: "Elliott Wave: Impulse and Correction",
          objectives: [
            "Describe the five-wave impulse and the three-wave correction.",
            "Explain how waves nest inside larger waves.",
          ],
          estimatedMinutes: 15,
          instruction: [
            "Ralph Nelson Elliott, in the 1930s, proposed that crowd psychology moves markets in repeating patterns. A move in the direction of the larger trend, he said, unfolds in five waves: three that advance (1, 3 and 5) separated by two that pull back (2 and 4). This is the impulse.",
            "After an impulse comes a correction, usually in three waves labelled A, B and C: a move against the trend, a partial recovery, and a final move against it again. Corrections take several shapes. A zigzag is sharp and deep, a flat goes mostly sideways, and a triangle narrows as it goes.",
            "Waves nest. Each of the five waves of an impulse is itself made of smaller waves, and the whole five-wave move is just wave 1 or 3 or 5 of something larger. Elliott named the sizes, from waves lasting minutes up to ones lasting decades. That is why two analysts can look at the same chart and count it differently: they may be counting different sizes.",
            "Mr. Bull's use for it: wave 3 is often the strongest and longest, so a trader who recognises the end of wave 2 is entering where the trend has the most still ahead. Mrs. Bear's caution: a wave count is a map of possibilities, not a forecast. There is almost always more than one valid count, so every count needs a price that would prove it wrong.",
          ],
          application:
            "Pick a stock in a clear uptrend. Try to label the last five waves up and the correction after them. Then write down one other way the same chart could be counted.",
          quiz: [
            q("An Elliott impulse unfolds in:", ["Three waves", "Five waves: three advancing, two pulling back", "Seven waves", "Any number of waves"], 1),
            q("A correction is usually labelled:", ["1-2-3-4-5", "A-B-C", "X-Y-Z only", "It has no labels"], 1),
            q("Why can two analysts count the same chart differently?", ["One must be cheating", "Waves nest, and more than one count can be valid", "Charts change after the fact", "Counts only work on Fridays"], 1),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/time",
          title: "Cycles and Seasonality: What Traders Watch",
          objectives: [
            "Name the seasonal and calendar tendencies traders commonly watch.",
            "Explain why a calendar tendency is a reason to watch, never a reason to trade on its own.",
          ],
          estimatedMinutes: 12,
          instruction: [
            "Many traders watch the calendar. Some well-known tendencies: the 'Sell in May' observation that US stocks have, on average, gained less from May to October than from November to April; the turn-of-the-month effect, with gains bunched in the last and first few days of a month; the January effect for small stocks; and the four-year presidential cycle, in which the year before an election has often been the strongest. Earnings seasons, four times a year, bring bigger moves in individual stocks.",
            "Traders also look for cycles in price itself: lows that seem to come at fairly regular intervals. On a chart it is easy to see rhythm, because the eye finds patterns even in random data. A rhythm that is real should keep working on years it wasn't found in, should beat a random calendar, and should survive a proper statistical test. Most claimed cycles fail at least one of those.",
            "Mrs. Bear's rule: these are averages over many years, and any one year can go the other way. A seasonal tendency is a reason to pay closer attention, never a reason to buy or sell on its own. Price and the trend come first; the calendar only tells you when to look harder.",
            "Mr. Bull's use for it: if your chart already says buy and the calendar is on your side, fine. If they disagree, believe the chart.",
          ],
          application:
            "Take a stock you follow. Look at how it did in each of the last five Mays through Octobers against each November through April. Would that tendency alone have been worth trading?",
          quiz: [
            q(
              "A calendar or seasonal tendency is best used as:",
              ["A reason to trade on its own", "A reason to watch more closely, with price and trend deciding", "A guarantee", "Something to ignore completely"],
              1,
            ),
            q(
              "A cycle that is real should:",
              ["Look good on one chart", "Keep working on data it wasn't found in and beat a random calendar", "Be secret", "Only work in January"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/entries-and-exits",
          title: "Fibonacci Retracements and Extensions",
          objectives: [
            "Draw Fibonacci retracement levels on a swing and name the common ratios.",
            "Use extensions to mark where a move might run, and say why they are levels to watch, not targets.",
          ],
          estimatedMinutes: 13,
          instruction: [
            "The Fibonacci sequence (1, 1, 2, 3, 5, 8, 13, 21 and on, each number the sum of the two before) gives a set of ratios traders use to measure pullbacks. Dividing a number by the next gives about 0.618; by the one after that, about 0.382. Traders add 0.5 and 0.786 to make the common set: 23.6%, 38.2%, 50%, 61.8% and 78.6%.",
            "To draw retracements on a rise, measure from the swing low to the swing high. The levels show how far a pullback might go before the trend resumes. A shallow pullback to 38.2% suggests a strong trend; one that goes past 61.8% suggests the trend is weakening. Elliott Wave traders often expect wave 2 to retrace 50% to 61.8% of wave 1, and wave 4 less.",
            "Extensions measure beyond the move. Projected from the end of a pullback, 127.2%, 161.8% and 261.8% of the prior swing are levels where traders watch for a move to slow. Elliott traders often look for wave 3 near 161.8% of wave 1.",
            "Mrs. Bear's caution: with five or six levels on every swing, price is almost always near one of them, so a level on its own proves little. Use them where they line up with something else, an old high or low, a round number or a trading range, and always with a stop beyond the level you are relying on.",
          ],
          application:
            "On a recent rise, draw the Fibonacci retracements from the low to the high. Where did the last pullback stop? Did that level line up with an old high or low?",
          quiz: [
            q(
              "The common Fibonacci retracement levels include:",
              ["10%, 20%, 30%", "38.2%, 50%, 61.8%", "Only 100%", "33% and 66% only"],
              1,
            ),
            q(
              "Why should a Fibonacci level not be trusted on its own?",
              ["The ratios are wrong", "With so many levels, price is nearly always near one; it needs something else lining up", "It only works on crypto", "It is too far from price"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/volume-and-the-trader",
          title: "Elliott Wave: The Rules, the Guidelines and the Invalidation Price",
          objectives: [
            "State the three fixed rules of an Elliott impulse.",
            "Turn a wave count into a trade with a price that proves it wrong.",
          ],
          estimatedMinutes: 13,
          instruction: [
            "An Elliott count is only valid if it keeps three rules. Wave 2 never retraces past the start of wave 1. Wave 3 is never the shortest of waves 1, 3 and 5. Wave 4 never moves into the price range of wave 1 (in most markets). A count that breaks one of these is not a different count, it is a wrong one.",
            "Beyond the rules sit guidelines, which hold often but not always. Alternation: if wave 2 is sharp, wave 4 tends to be sideways, and the other way round. Equality: when wave 3 is the extended one, waves 1 and 5 are often about equal. Volume is usually heaviest in wave 3 and lighter in wave 5, which is one way a tiring trend shows itself.",
            "The rules are what make Elliott Wave tradeable. If you count the end of wave 2 and buy, the start of wave 1 is your invalidation price: below it, the count is wrong by rule. So the stop has a reason, not just a distance. If you count wave 4 and buy for wave 5, the top of wave 1 is the line.",
            "Mrs. Bear's caution: counts get revised all the time, and a trader who keeps re-counting to stay right is no longer trading a method. Decide the count, the invalidation price and the size before the trade, and take the stop if it comes.",
          ],
          application:
            "Take your count from the impulse lesson. Check it against the three rules. If you were buying the end of wave 2, where is the invalidation price, and how many shares would 1% of a $10,000 account buy with a stop just beyond it?",
          quiz: [
            q(
              "Which is one of Elliott's three fixed rules?",
              ["Wave 5 is always the longest", "Wave 3 is never the shortest of waves 1, 3 and 5", "Every correction is a triangle", "Wave 2 always retraces exactly 50%"],
              1,
            ),
            q(
              "If you buy what you count as the end of wave 2, the count is wrong by rule if price falls below:",
              ["The top of wave 1", "The start of wave 1", "A round number", "Yesterday's close"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/pyramiding",
          title: "Position Sizing and Adding to a Winner",
          objectives: [
            "Size a position by fixed fractional risk.",
            "State the conditions under which a position may be added to, and how the stop moves.",
          ],
          estimatedMinutes: 13,
          instruction: [
            "Fixed fractional sizing risks the same small share of the account on every trade. The size comes from the stop: risk amount divided by the distance from entry to stop. When the account grows, trades grow with it; after a loss, they shrink at once. Formulas that size for maximum growth, such as the Kelly criterion, tell you how much an edge could justify, and most professionals use a fraction of that or less, because the real edge is never known exactly.",
            "Adding to a position, pyramiding, is earned, never hoped for. Add only when the trade already shows a profit and the market confirms the trend again, for example with a new breakout. Adding to a losing trade to improve the average price is the habit this rule exists to prevent.",
            "Keep the pyramid the right way up: each addition smaller than the one before. The largest amount goes on first, when the trend is youngest; later additions get less, because the move is getting older and the risk of a turn is growing.",
            "With every addition, move the stop on the whole position so that a reversal can cost profit but not much capital, and check that a stop-out of everything together still fits your risk limit. GSPS suggests an add on the Portfolio when a position has earned one; you place it yourself through the order ticket.",
          ],
          application:
            "Take a trend you know. Mark the first entry, the first new breakout after it and a smaller second lot there. Where would the stop on the whole position go after the second lot?",
          quiz: [
            q("Fixed fractional sizing means:", ["The same number of shares every time", "Risking the same small share of the account on every trade", "Doubling after a loss", "Sizing by how confident you feel"], 1),
            q("A position may be added to when:", ["It is losing and the price is cheaper", "It already shows a profit and the trend confirms again", "Any day of the week", "Volume rises once"], 1),
            q("In a well-built pyramid, each addition is:", ["Larger than the last", "Smaller than the last", "The same as the first", "Random"], 1),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/seven-zones",
          title: "The Four Stages of a Market",
          objectives: [
            "Place a stock in one of the four stages: basing, advancing, topping or declining.",
            "Explain which stages are for buying, which for selling, and which for waiting.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Many traders, following Stan Weinstein's popular description, see every stock moving through four stages. Stage 1 is the base: a sideways range after a decline, with sellers running out. Stage 2 is the advance: a breakout from the base into higher highs and higher lows. Stage 3 is the top: a sideways range after the advance, with buyers running out. Stage 4 is the decline: a breakdown into lower highs and lower lows. Wyckoff's accumulation, markup, distribution and markdown describe the same circle.",
            "The stages tell you what kind of trade belongs where. Buy in stage 2, ideally early, on the breakout from stage 1 or the first pullback after it. Sell or short in stage 4. Stages 1 and 3 are for waiting: a range can last a long time, and nobody knows which way it will leave until it does.",
            "Each stage has a look. A base often forms on quieter volume and narrowing ranges. The advance shows rising volume on up moves. A top is often busy and choppy, with wide swings, heavy volume and failed new highs. The decline shows rallies that fail below old highs.",
            "Mrs. Bear's caution: the stages are clear in hindsight and blurry while you are in them. Use the breakout or breakdown from a range, on volume, to confirm a new stage rather than guessing it early.",
          ],
          application:
            "Take a stock you follow. Mark the range it spent most of the last year in, then say which stage it is in now and what would tell you it had moved to the next one.",
          quiz: [
            q(
              "In the four-stage model, the stage for buying is:",
              ["Stage 1, the base", "Stage 2, the advance", "Stage 3, the top", "Stage 4, the decline"],
              1,
            ),
            q(
              "A stock is in a sideways range after a long advance. Which stage is it likely in, and what should you do?",
              ["Stage 2, buy more", "Stage 3, wait for it to show which way it leaves", "Stage 4, short at once", "Stage 1, buy at once"],
              1,
            ),
          ],
          reviewMeta: AUTHOR,
        },
        {
          id: "academy-6/method-rules/trader-qualifications",
          title: "Trading Psychology: Hope, Fear and the Plan",
          objectives: [
            "Explain why hope and fear are a trader's chief enemies.",
            "Name the habits that protect a trader from them.",
          ],
          estimatedMinutes: 10,
          instruction: [
            "Most trading losses come from the trader, not the market. Hope keeps a losing trade open long after the plan said to close it. Fear closes a winning trade too early, or keeps you out of the next good one. Greed makes a trade too big. Each feels reasonable at the time.",
            "The defence is a plan written before the trade, followed every time: the entry, the stop, the size and what would make you leave. Once a trade is on, the decisions have already been made, and your job is to carry them out, not to re-argue them.",
            "Three habits help. Keep a journal, and read it back for repeated mistakes. Know your state: don't trade tired, unwell, angry or after a big loss or win. And prove a method to yourself on paper before you trust it with money. That is why GSPS has paper trading before live money and pauses new entries after a run of losses.",
            "Mr. Bull's reminder: you will be wrong often, even with a good method. The goal isn't to be right on every trade; it is to lose small when wrong and let the winners pay for the losers.",
          ],
          application:
            "Read back your last five trades, real or paper. For each, write whether hope, fear or greed changed what you did, and what your plan said to do instead.",
          quiz: [
            q(
              "Hope is a trader's enemy because it:",
              ["Makes you take profits too early", "Keeps a losing trade open when the plan says to close it", "Stops you trading at all", "Has no effect on trading"],
              1,
            ),
            q(
              "The best defence against hope and fear is:",
              ["Trading bigger", "A written plan made before the trade and followed every time", "Watching the news", "Removing your stop"],
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
            "GSPS places trades in U.S. stocks, funds and crypto, with options on paper only; futures and forex show live quotes only for now, and commodities are reached only through funds that hold them. This lesson exists so a learner has working vocabulary for options, futures, forex, crypto, and commodities when they encounter them — it is conceptual literacy, not a workflow, and nothing in this lesson or lab constructs an order in any of these instruments.",
            "Options carry defined-risk (long option) and undefined-risk (short/naked option) variants — the distinction matters enormously and is a common source of catastrophic, unplanned loss when misunderstood. Futures and forex trade on margin with leverage that can amplify losses beyond the initial capital committed. Short-selling carries theoretically unlimited loss potential, since a shorted asset's price has no upper bound.",
            "Hedging, conceptually, is taking an offsetting position to reduce (not eliminate) risk on an existing position — a real technique used by professionals, and conceptually useful to understand even where GSPS does not execute the hedge itself.",
          ],
          application:
            "In your own words, explain why short-selling's loss potential is structurally different from a long position's loss potential.",
          quiz: [
            q(
              "GSPS's actual execution scope is:",
              ["U.S. stocks and futures only", "U.S. stocks, funds and crypto (options on paper only)", "Global multi-asset including forex", "Forex and commodities only"],
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
        "The existing live-capital/loss-cascade/stop-rule re-certification pilot — unchanged. Required only to lift a live-trading restriction recorded under the retired 50% loss rule, not for initial Wall Street purchase.",
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

/** An academy's lessons that count toward its completion (every lesson but the optional ones). */
export function requiredLessonIds(academy: Academy): string[] {
  return academy.courses.flatMap((c) => c.lessons.filter((l) => !l.optional).map((l) => l.id));
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
    .filter((l) => l.id !== "academy-3/preservation/paper-validation" && !l.optional);
}

/** The one lesson whose completion represents the validated paper-trading requirement. */
export const PAPER_VALIDATION_LESSON_ID = "academy-3/preservation/paper-validation";

/** Lessons in the Wall Street capstone course (Academy 8, non-W2) required for wall_street_school_completed_at. */
export function wallStreetCapstoneLessons(): readonly CurriculumLesson[] {
  const course = ACADEMY_8.courses.find((c) => c.id === WALL_STREET_CAPSTONE_COURSE_ID);
  return course?.lessons.filter((l) => !l.optional) ?? [];
}

/**
 * Academies (by id) that count toward the "advanced curriculum" gate used
 * by the Pro→Expert Curriculum promotion path (`lib/promotion/curriculumPolicy.ts`).
 * Academies 4-7 ("Sharpening the Edge" / "Professional Toolkit") were
 * advisory-only until this path existed — this is the first thing that
 * reads their completion as sufficient for a real promotion, not a change
 * to the academies themselves. Selected by academy `number` (4-7), not by
 * `programIds` tag: Academy 6 also carries a "systemization-capital-
 * stewardship" tag (it doubles as a required Wall Street prerequisite, per
 * its own comment) but is still Academy 6 and belongs in this set —
 * filtering by tag alone would have silently dropped it.
 */
export const ADVANCED_CURRICULUM_ACADEMY_IDS = ACADEMIES.filter((a) => a.number >= 4 && a.number <= 7).map(
  (a) => a.id,
);

/** Lessons across Academies 4-7 whose collective completion is required for the Pro→Expert curriculum path. */
export function advancedCurriculumLessons(): readonly CurriculumLesson[] {
  return ACADEMIES.filter((a) => ADVANCED_CURRICULUM_ACADEMY_IDS.includes(a.id)).flatMap((a) =>
    a.courses.flatMap((c) => c.lessons.filter((l) => !l.optional)),
  );
}
