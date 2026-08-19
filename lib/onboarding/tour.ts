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
 * The reader has never placed a trade. Not "is a bit rusty" — has never done it
 * and may not be sure they want to. So:
 *
 *   - One idea per step. If a step needs the word "and" twice it is two steps.
 *   - Every term is defined the first time it appears, in the same sentence,
 *     without sending the reader somewhere else to find out.
 *   - Say what a thing is *for* before saying what it is called.
 *   - Nothing is oversold. This tool can lose money, the tour says so, and it
 *     says so early rather than in a footnote.
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
  | "position"
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
    title: "Welcome — here's what this is",
    figure: "none",
    body: [
      "GSPS watches the stock market for you and points out moments that look worth acting on. That's the whole idea.",
      "It does three things: it looks for opportunities, it works out exactly how much to buy and when to get out, and it keeps a record of how everything turned out.",
      "This tour walks through every part of it. It takes about five minutes, you can leave at any point, and you can start it again later from Settings.",
    ],
  },
  {
    id: "practice-money",
    title: "First: none of this is real money",
    figure: "none",
    body: [
      "Your account starts with $100,000 of pretend money. It isn't real, you can't lose anything real with it, and nobody asked you for a bank account.",
      "This is called paper trading. The prices are real and the results are real, but the money is play money — like a flight simulator for the stock market. Get it wrong as many times as you want.",
      "The rest of this tour uses that practice account for every example.",
    ],
  },
  {
    id: "example-note",
    title: "About the pictures in this tour",
    figure: "chart",
    body: [
      `Every example you're about to see uses one saved snapshot of SPY, taken on ${SNAPSHOT_TAKEN_LABEL}.`,
      SNAPSHOT_SYMBOL_PLAIN,
      "It's frozen on purpose, so the tour always matches what it's describing. The real screens will show today's prices instead, so your numbers will look different from these. That's expected — nothing is broken.",
      "The chart shows the last 30 days. Each vertical bar is one day: the thin line is the highest and lowest price that day, and the thick part is where it opened and closed.",
    ],
  },
  {
    id: "dashboard",
    title: "Dashboard — what happened while you were away",
    figure: "scan",
    anchor: "nav-dashboard",
    href: "/dashboard",
    hrefLabel: "Open the Dashboard",
    body: [
      "This is your home screen. Once a day GSPS looks over the market and lists what it found, so you can see the whole picture in about ten seconds.",
      "Setups are split into two lists: ones where it thinks the price may rise, and ones where it thinks the price may fall. Each row gives a score out of 9 for how strong the setup looks, and a one-word verdict.",
      "Execute means it's strong and ready. Watch means keep an eye on it — it isn't ready yet. Reject means skip it. You'll see those three words all over the app.",
      "There's also a short list of well-known symbols you can tap to look at any time, plus upcoming company earnings dates and market news.",
    ],
  },
  {
    id: "guided",
    title: "Guided — the one to start with",
    figure: "guided",
    anchor: "nav-guided",
    href: "/guided",
    hrefLabel: "Open Guided",
    body: [
      "Guided is the simplest way to use GSPS, and it's where we'd suggest you begin.",
      "Instead of a screen full of numbers, it shows you one suggestion at a time, written as a sentence. What it thinks you should do, why, how much it would cost, and what happens if it goes wrong.",
      "Only the strongest setups get here — the ones scoring Execute with a complete plan already worked out. Everything else is filtered out before you ever see it.",
      "Guided only ever uses practice money. If you connect a real brokerage account later, Guided switches itself off rather than risk it.",
    ],
  },
  {
    id: "guided-size",
    title: "You never have to work out how much to buy",
    figure: "guided",
    anchor: "nav-guided",
    href: "/guided",
    hrefLabel: "Open Guided",
    body: [
      "Deciding how many shares to buy is where beginners usually get hurt, so GSPS does that part for you.",
      "In the example, it settled on 36 shares. Two separate safety limits were checked. The first says no single trade may risk more than 1% of your account — that would have allowed 135 shares. The second says no more than a quarter of your account can be in the market at once — that only allows 36.",
      "When two limits disagree, the more cautious one always wins. So you get 36.",
      "Then it tells you what that means in dollars: about $266 at risk, about $472 if it goes well. Not percentages, not ratios — dollars.",
    ],
  },
  {
    id: "guided-confirm",
    title: "Nothing happens until you say so",
    figure: "none",
    anchor: "nav-guided",
    href: "/guided",
    hrefLabel: "Open Guided",
    body: [
      "Tapping the button doesn't place anything. It opens a summary that repeats the symbol, whether you're buying or selling, how many shares, and both dollar figures — and you have to confirm that separately.",
      "You can also just skip a suggestion. There's no penalty and no pressure; it moves on to the next one.",
      "GSPS never trades on its own. There is no setting that lets it. Every single order in this app was confirmed by a person.",
      "One thing to be clear about: these are suggestions produced by a set of rules, not financial advice tailored to you or your situation. They can be wrong, and some of them will be.",
    ],
  },
  {
    id: "scanner",
    title: "Scanner — going looking yourself",
    figure: "scan",
    anchor: "nav-scanner",
    href: "/scanner",
    hrefLabel: "Open the Scanner",
    body: [
      "The Scanner is the same search Guided uses, but you drive it. Type in the symbols you're curious about and it checks each one and reports back.",
      "It's useful when you have a company in mind — somewhere you shop, somewhere you worked — and you want to know whether GSPS sees anything there right now.",
      "Most of the time the answer is no, and that's normal. Good setups are rare. A scanner that found something every time wouldn't be worth much.",
    ],
  },
  {
    id: "chart",
    title: "The chart page — a closer look at one symbol",
    figure: "plan",
    href: "/dashboard",
    hrefLabel: "Pick a symbol from the Dashboard",
    body: [
      "Tapping any symbol opens its own page: a full-size chart with GSPS's reading of it drawn straight onto the picture.",
      "The most important thing on that page is the trade plan — four prices, decided before any money moves. This is what separates a plan from a guess.",
      "The blue line is the entry: the price where the trade would start. The red line is the stop loss: if the price falls to there, you're out, and the loss stops growing. The two green lines are profit targets.",
      "Every trade in GSPS has all four. There is no version of this where you buy something and then work out what to do next.",
    ],
  },
  {
    id: "levels",
    title: "The grey boxes and lines on the chart",
    figure: "chart",
    href: "/glossary",
    hrefLabel: "Look these up in the Glossary",
    body: [
      "You'll also see faint grey lines and shaded areas on the chart. Those mark price areas where the market has tended to slow down or turn around before.",
      "Think of them as a floor and a ceiling that aren't printed anywhere but that lots of people watch anyway. Prices often stall when they reach one.",
      "You don't need to understand how they're calculated to use the app. They're shown so you can see why GSPS picked the entry and stop where it did rather than having to take its word for it.",
      "Anything on that page you don't recognise is explained in the Glossary, in the same plain language as this tour.",
    ],
  },
  {
    id: "portfolio",
    title: "Portfolio — everything you've done",
    figure: "position",
    anchor: "nav-portfolio",
    href: "/portfolio",
    hrefLabel: "Open your Portfolio",
    body: [
      "This is your record. How much practice money you have, what you currently own, and how every past trade turned out.",
      "Positions are grouped into five lists: Open (you own it now), Pending (an order is waiting for its price), Rejected (an order was refused, with the reason), Closed (finished trades), and Canceled or Expired.",
      "On an open position, the profit or loss shown is what you'd get if you sold this instant. It moves constantly and it isn't real until you close the trade. Green is up, red is down.",
      "The list checks with the broker every time you open it, so it shows what's actually happening rather than what was happening earlier.",
    ],
  },
  {
    id: "automation",
    title: "Automation — getting out in stages",
    figure: "exits",
    anchor: "nav-automation",
    href: "/automation",
    hrefLabel: "Open Automation",
    body: [
      "Knowing when to sell is harder than knowing when to buy, so GSPS handles the selling for you, in pieces.",
      "Most of the position is sold at the first profit target. Some more goes at the second. A small remainder is left to keep running in case the price keeps climbing.",
      "That last piece is protected by a trailing stop — a sell price that follows the price upward and never moves back down. Once a trade is far enough ahead, it can't turn back into a loss.",
      "The exact share counts are shown before you agree to anything. Nothing is hidden until afterwards.",
    ],
  },
  {
    id: "backtest",
    title: "Backtest — checking the idea against history",
    figure: "backtest",
    anchor: "nav-learning",
    href: "/learning",
    hrefLabel: "Open Backtest",
    body: [
      "Backtest replays GSPS's rules over past market data and reports how they would have done. It's the honesty check.",
      "It tells you how often these setups made money and how much the average one made compared with what it risked.",
      "Read those numbers carefully. A tool that wins 6 times out of 10 is a good tool — and it still loses 4 times out of 10. Losses are part of it working correctly, not a sign it's broken.",
      "And however good the past looks, it doesn't promise anything about the future.",
    ],
  },
  {
    id: "glossary",
    title: "Glossary — the dictionary",
    figure: "none",
    anchor: "nav-glossary",
    href: "/glossary",
    hrefLabel: "Open the Glossary",
    body: [
      "Every term GSPS uses, explained in ordinary English. Entry, stop loss, long, short, all of it.",
      "Use it constantly. Nobody was born knowing these words, and looking one up takes ten seconds.",
      "It's linked from the chart pages too, so you can check a term without losing your place.",
    ],
  },
  {
    id: "settings",
    title: "Settings — the safety limits",
    figure: "caps",
    anchor: "nav-settings",
    href: "/settings",
    hrefLabel: "Open Settings",
    body: [
      "Settings is where the limits live — the ones that decided you were buying 36 shares and not 135.",
      "They ship deliberately cautious. You can loosen them, but GSPS won't let you past a hard ceiling however hard you push, because that ceiling is the point.",
      "This is also where you'd connect a real brokerage account, manage your subscription, and change your sign-in details. None of that is needed to use the practice account.",
      "And it's where you can run this tour again, any time you want.",
    ],
  },
  {
    id: "finish",
    title: "That's everything",
    figure: "none",
    href: "/guided",
    hrefLabel: "Start with Guided",
    body: [
      "Four things worth remembering:",
      "It's practice money — you cannot lose anything real. Nothing trades without you confirming it. Every trade knows how it ends before it starts. And losing trades are normal, not a mistake.",
      "If you're not sure where to begin, open Guided and just read a suggestion without acting on it. Reading them is free.",
      "This tour lives in Settings whenever you want it again.",
    ],
  },
];

/** Total steps, for "Step 3 of 15" counters that must not drift from the list. */
export const TOUR_STEP_COUNT = TOUR_STEPS.length;

/** Lookup by id, for deep links into a single step on /welcome. */
export function stepById(id: string): TourStep | undefined {
  return TOUR_STEPS.find((s) => s.id === id);
}
