/**
 * GSPS — the first-run tour, as content.
 *
 * The steps live here rather than inside a component because two different
 * surfaces render them: the spotlight overlay that runs on a user's first visit
 * (`components/onboarding/tour-overlay.tsx`) and the `/welcome` page they can
 * come back to afterwards. Those have to stay word-for-word identical — someone
 * returning for a refresher is looking for the thing they half-remember, and
 * finding it reworded is worse than not finding it.
 *
 * ## The voice
 *
 * The reader has never placed a trade. That is a gap in *vocabulary*, not in
 * intelligence, and the distinction decides how every sentence here is written.
 * Simple words, adult register — an explanation a competent person would want,
 * not one pitched at a child.
 *
 * What that means concretely:
 *
 *   - **Name the subject.** "GSPS calculates the size", not "it works it out".
 *     Chains of pronouns are the fastest route to prose that sounds like a
 *     children's book while also being harder to follow, because the reader is
 *     tracking what each "it" refers to instead of the idea. `tour.test.ts`
 *     enforces a ceiling on this rather than trusting good intentions.
 *   - **One idea per step.** A step needing "and" twice is two steps.
 *   - **Define on first use, in the same sentence.** Never send the reader
 *     elsewhere mid-thought to find out what a word means.
 *   - **Say what a thing is for before saying what it is called.**
 *   - **State the downside early.** This tool can lose money. That belongs in
 *     the body, not a footnote, and not softened.
 *   - **No cheerleading.** No "that's the whole idea", no exclamation marks,
 *     nothing that sounds like a brochure. The reader is deciding whether to
 *     trust software with money; enthusiasm reads as evasion.
 *
 * ## The anchors
 *
 * `anchor` is a `data-tour` value, not a class or an id: those change when
 * someone restyles a component and the breakage is silent — the tour keeps
 * running and just stops pointing at anything. A `data-tour` attribute has no
 * other purpose, so it survives restyling and is obvious to anyone deleting the
 * element it sits on. A step whose anchor is absent from the page (the Glossary
 * link, which gives up its slot in the phone tab bar) still renders — the
 * overlay centres it instead of pointing. See `resolveAnchor` in the overlay.
 */

import {
  SNAPSHOT_SYMBOL_PLAIN,
  SNAPSHOT_TAKEN_LABEL,
} from "./spy-snapshot";

/**
 * Which piece of the frozen SPY snapshot a step illustrates. `"none"` is a real
 * answer, not a gap: the opening and closing steps are about what the app is
 * and what is safe, and a chart next to those would be decoration.
 */
export type TourFigure =
  | "none"
  | "chart"
  | "plan"
  | "scan"
  | "guided"
  | "exits"
  | "portfolio"
  | "backtest"
  | "caps";

export interface TourStep {
  /** Stable id — used for the URL hash on /welcome and as the React key. */
  id: string;
  /** Short heading. Sentence case, no jargon. */
  title: string;
  /** Body copy, one string per paragraph. */
  body: string[];
  /** `data-tour` value of the element to spotlight, when the step has one. */
  anchor?: string;
  /**
   * The page this step is about. The overlay navigates here on entry, so the
   * screen behind the bubble is the screen being described.
   *
   * Distinct from `href`, which is an optional extra link the reader may follow
   * themselves. A step that explains the Settings limits sets `route` to
   * `/settings`; a step that says "pick any symbol" sets `href` to the
   * dashboard without claiming the dashboard is what it is describing.
   */
  route?: string;
  /** Where this step lives in the app, for the "take me there" link. */
  href?: string;
  /** Label for that link. Reads as an instruction, not a destination name. */
  hrefLabel?: string;
  /** Which part of the frozen snapshot to draw beside the copy. */
  figure: TourFigure;
}

/**
 * Bumped when the steps change materially. Stored alongside a user's completion
 * record so a future revision can tell "has never seen the tour" apart from
 * "saw version 1" — the first auto-launches, the second does not, because
 * re-interrupting someone who already learned the app is a worse failure than
 * letting them miss a new step they can reach from Settings whenever they like.
 */
export const TOUR_VERSION = 1;

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to GSPS \u2014 Trading Made Easy",
    figure: "none",
    body: [
      "GSPS scans the stock market and flags the moments worth your attention.",
      "Three jobs, all handled here: finding opportunities, calculating how much to buy and the exact prices to sell at, and recording how every trade turned out.",
      "This tour covers every screen in the app. Five minutes start to finish, leave whenever you like, and Settings holds a button to run the whole thing again.",
    ],
  },
  {
    id: "practice-money",
    title: "Everything here is practice money",
    figure: "portfolio",
    route: "/portfolio",
    anchor: "portfolio-account",
    body: [
      "Your account opens with $100,000 that does not exist. No bank details, no deposit, nothing real at stake.",
      "The industry calls this paper trading. Real prices, real results, imaginary money \u2014 a flight simulator for the stock market. Crash as often as you like.",
      "The Portfolio screen tracks that practice balance: cash on hand, what your holdings are currently worth, and profit or loss to date. Every example in this tour draws on the same account.",
    ],
  },
  {
    id: "example-note",
    title: "About the examples in this tour",
    figure: "chart",
    body: [
      `Every picture ahead shows SPY, captured ${SNAPSHOT_TAKEN_LABEL}.`,
      SNAPSHOT_SYMBOL_PLAIN,
      "These figures are frozen \u2014 a saved snapshot rather than a live feed \u2014 so the pictures always match the words beside them. Your own screens will show today's prices and different numbers. Nothing is broken.",
      "Read the chart left to right, one bar per day. The thin line spans the day's high and low; the thick block marks where the price opened and closed.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard \u2014 the morning briefing",
    figure: "scan",
    route: "/dashboard",
    anchor: "dash-setups",
    body: [
      "Your home screen. Once a day GSPS reviews the market and posts the findings here, so ten seconds gives you the state of play.",
      "Findings split two ways: symbols expected to rise, and symbols expected to fall. Each row carries a score out of 9 and a one-word verdict.",
      "Execute means strong and ready to trade. Watch means promising but not yet. Reject means leave alone. Those three words appear throughout GSPS.",
      "The Dashboard also lists familiar symbols you can open on a tap, upcoming company earnings dates, and market news.",
    ],
  },
  {
    id: "guided",
    title: "Guided \u2014 start here",
    figure: "guided",
    route: "/guided",
    anchor: "guided-card",
    body: [
      "Guided is the simplest route through GSPS, and the right place to begin.",
      "Rather than a screen of figures, Guided presents one recommendation at a time in full sentences: the action, the reasoning behind it, the cost, and the downside.",
      "Only the strongest candidates reach Guided \u2014 setups scoring Execute with a complete trade plan already calculated. Everything weaker is filtered out before you ever see a card.",
      "Guided trades practice money exclusively. Connect a real brokerage account later and Guided shuts itself off rather than risk live funds.",
    ],
  },
  {
    id: "guided-size",
    title: "GSPS calculates the position size",
    figure: "guided",
    route: "/guided",
    anchor: "guided-card",
    body: [
      "Choosing how many shares to buy is where beginners lose money, so GSPS makes that call for you.",
      "The example lands on 36 shares after two safety limits are checked. The first caps any single trade at 1% of the account, which would permit 135 shares. The second caps total holdings at a quarter of the account, which permits only 36.",
      "When two limits disagree, the stricter number wins. Hence 36.",
      "GSPS then translates the position into money: roughly $266 at risk, roughly $472 if both profit targets are reached. Dollars, not percentages.",
    ],
  },
  {
    id: "guided-confirm",
    title: "Nothing reaches the market without your approval",
    figure: "none",
    route: "/guided",
    anchor: "guided-card",
    body: [
      "The button on a recommendation places no order. Tapping opens a summary \u2014 symbol, buy or sell, share count, both dollar figures \u2014 and a second, separate approval.",
      "Declining costs nothing. Skip a recommendation and Guided moves to the next one.",
      "GSPS never trades on your behalf. No setting enables that. Every order this app has ever sent was confirmed by a person first.",
      "One caveat, stated plainly: recommendations come from a fixed set of scoring rules, not financial advice tailored to your circumstances. Some will be wrong.",
    ],
  },
  {
    id: "scanner",
    title: "Scanner \u2014 search on your own terms",
    figure: "scan",
    route: "/scanner",
    anchor: "scanner-universe",
    body: [
      "The Scanner runs the same analysis Guided runs, except you choose the targets. Enter any list of symbols and GSPS reports back on each one.",
      "Useful when a particular company is already on your mind \u2014 a store you shop at, a former employer \u2014 and you want a read on that company right now.",
      "Expect \u201Cnothing here\u201D most of the time. Strong setups are genuinely rare, and a scanner that found one every session would be worth very little.",
    ],
  },
  {
    id: "chart",
    title: "The symbol page \u2014 one company up close",
    figure: "plan",
    route: "/dashboard",
    anchor: "dash-watchlist",
    href: "/dashboard",
    hrefLabel: "Pick a symbol from the Dashboard",
    body: [
      "Tapping any symbol opens a dedicated page: a full chart with GSPS's analysis drawn directly onto the price.",
      "The trade plan is the centrepiece \u2014 four prices fixed before a single dollar moves. Those four prices are what separate a plan from a hunch.",
      "Blue marks the entry, the price at which the trade begins. Red marks the stop loss: reach that price and the position closes, capping the damage. Two green lines mark profit targets.",
      "Every GSPS trade carries all four. No position opens without an exit already decided.",
    ],
  },
  {
    id: "levels",
    title: "The grey lines and shaded bands",
    figure: "chart",
    route: "/glossary",
    anchor: "glossary-terms",
    body: [
      "Faint grey lines and shaded bands also appear on the chart, marking price areas where the market has slowed or reversed before.",
      "Treat those bands as an unofficial floor and ceiling \u2014 printed nowhere, watched by plenty of traders, and often where a move runs out of steam.",
      "The underlying maths is not something you need. The bands are drawn so the reasoning behind an entry and a stop stays visible, rather than being something GSPS asks you to take on faith.",
      "Anything unfamiliar on that page has a plain-language definition waiting in the Glossary.",
    ],
  },
  {
    id: "portfolio",
    title: "Portfolio \u2014 the complete record",
    figure: "portfolio",
    route: "/portfolio",
    anchor: "portfolio-account",
    body: [
      "Your account and your history in one place: practice balance, current holdings, and the outcome of every trade closed so far.",
      "Holdings sort into five lists. Open covers what you hold now. Pending covers orders waiting for a price. Rejected covers orders the broker refused, with the reason attached. Closed covers finished trades. Canceled or Expired covers the remainder.",
      "On an open position, the profit figure answers one question: what would selling right now produce? That number moves constantly and stays hypothetical until the position closes. Green is a gain, red is a loss.",
      "Every visit re-checks the lists against the broker, so the screen reflects the current state rather than a stale copy.",
    ],
  },
  {
    id: "automation",
    title: "Automation \u2014 selling in stages",
    figure: "exits",
    route: "/automation",
    anchor: "automation-deployments",
    body: [
      "Knowing when to sell is harder than knowing when to buy, so GSPS divides the exit into stages.",
      "The bulk of a position sells at the first profit target. A further slice sells at the second. A small remainder stays open in case the price keeps climbing.",
      "That remainder sits behind a trailing stop \u2014 a sell price that climbs with the market and never retreats. Once a trade is far enough ahead, a reversal cannot turn the gain back into a loss.",
      "Exact share counts appear on the ticket before you approve anything.",
    ],
  },
  {
    id: "backtest",
    title: "Backtest \u2014 checking the record",
    figure: "backtest",
    route: "/learning",
    anchor: "backtest-run",
    body: [
      "Backtest replays GSPS's rules across past market data and reports the outcome. Consider this the honesty check.",
      "Two figures matter: how often these setups made money, and how much the average trade returned against what that trade risked.",
      "Read both carefully. A system winning 6 trades in 10 is a good system \u2014 and still loses the other 4. Losing trades are a normal part of a working method, not a sign of a broken one.",
      "A strong record across past data still promises nothing about next week.",
    ],
  },
  {
    id: "glossary",
    title: "Glossary \u2014 every term defined",
    figure: "none",
    route: "/glossary",
    anchor: "glossary-terms",
    body: [
      "Plain-English definitions for the whole vocabulary: entry, stop loss, long, short, and the rest.",
      "Lean on the Glossary freely. Nobody arrives knowing these words, and a definition takes ten seconds to read.",
      "Symbol pages link straight into the Glossary, so checking a term never costs you your place.",
    ],
  },
  {
    id: "settings",
    title: "Settings \u2014 where the limits live",
    figure: "caps",
    route: "/settings",
    anchor: "settings-caps",
    body: [
      "Settings holds the safety limits \u2014 the rules that produced 36 shares instead of 135.",
      "The shipped values are deliberately cautious. Loosening them is allowed; pushing past the hard ceiling is not, because that ceiling is the entire point.",
      "Settings also handles connecting a real brokerage account, managing your subscription, and changing your sign-in details. None of that is required to trade the practice account.",
      "This tour lives here too, ready to run again whenever you want.",
    ],
  },
  {
    id: "finish",
    title: "That covers everything",
    figure: "none",
    href: "/guided",
    hrefLabel: "Start with Guided",
    body: [
      "Four things worth carrying forward.",
      "The money is practice money, so nothing real is at stake. No order goes out without your approval. Every trade has an exit planned before the entry. And losing trades are a normal part of the process.",
      "Unsure where to start? Open Guided and read a recommendation without acting on it. Reading costs nothing.",
      "Settings holds this tour whenever you want a refresher.",
    ],
  },
];

/** Total steps, for "Step 3 of 15" counters that must not drift from the list. */
export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/**
 * Where a step's "take me there" link should point on the reading page.
 *
 * `/welcome` is read rather than walked — nothing navigates on the reader's
 * behalf there — so every step that names a destination should offer a way to
 * reach it. Most steps carry a `route` (used by the overlay to navigate) and no
 * `href`; a few carry an `href` to somewhere they are not describing, like the
 * chart step pointing at the dashboard to pick a symbol from. The explicit
 * `href` wins where both exist, because it was chosen for the reader rather
 * than for the overlay.
 */
export function stepLink(step: TourStep): { href: string; label: string } | null {
  if (step.href && step.hrefLabel) return { href: step.href, label: step.hrefLabel };
  if (step.route) return { href: step.route, label: `Open ${routeLabel(step.route)}` };
  return null;
}

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "the Dashboard",
  "/guided": "Guided",
  "/scanner": "the Scanner",
  "/portfolio": "your Portfolio",
  "/automation": "Automation",
  "/learning": "Backtest",
  "/glossary": "the Glossary",
  "/settings": "Settings",
};

function routeLabel(route: string): string {
  return ROUTE_LABELS[route] ?? route;
}

/** Lookup by id, for deep links into a single step on /welcome. */
export function stepById(id: string): TourStep | undefined {
  return TOUR_STEPS.find((s) => s.id === id);
}
