/**
 * GSPS — contextual tips, in the shape Clippy should have had.
 *
 * A tip is a short explanation from Mrs. Bull or Mr. Bear that appears beside a
 * real control the first time a user meets it: what a stop loss is, the moment
 * an order ticket is open; why an order was rejected, the first time one is.
 *
 * ## The Clippy problem, stated plainly
 *
 * Clippy is a punchline because he interrupted work nobody asked him to join,
 * was hard to get rid of, and came back. Every rule below exists to avoid one
 * of those, and none of them is a style preference:
 *
 *   - **Never covers its subject.** A tip about the stop-loss field renders
 *     beside or below that field, never over it, and never over a submit
 *     button. A hint that blocks the thing it is explaining is worse than no
 *     hint, because now the user cannot act *and* cannot read.
 *   - **One at a time.** Two tips on one screen is a conversation between
 *     mascots that the user is watching instead of trading.
 *   - **Dismiss means forever.** Not "until next session". Stored per user, so
 *     it holds across devices.
 *   - **One global switch.** Someone who wants none of this turns all of it
 *     off in Settings, in one action, without hunting for individual tips.
 *   - **Never on a destructive or irreversible control.** No tip attaches to
 *     order submission, position closing, or anything that moves money.
 *
 * ## Why the copy lives here
 *
 * Same reason the tour's does: it is product content, it needs reviewing as
 * prose, and the components that render it should not be where it is written.
 */

import type { MascotName } from "@/components/onboarding/mascots";

export interface Tip {
  /** Stable id. Used as the dismissal key, so renaming one un-dismisses it. */
  id: string;
  /** Who explains this. Risk and protection are Mr. Bear's; the rest are Mrs. Bull's. */
  mascot: MascotName;
  title: string;
  /** One or two short sentences. A paragraph here is a tour step in the wrong place. */
  body: string;
  /** Optional deeper reading, almost always the glossary. */
  href?: string;
  hrefLabel?: string;
}

/**
 * Every tip in the app, keyed by id.
 *
 * Deliberately few. The value of a contextual hint collapses as soon as they
 * are everywhere — a user who has learned to dismiss them without reading has
 * been trained by volume, and adding a sixth is how that starts.
 */
export const TIPS: Record<string, Tip> = {
  "stop-loss": {
    id: "stop-loss",
    mascot: "bear",
    title: "What the stop loss does",
    body:
      "The stop loss is the price where you give up on a trade and get out. Setting it before you buy is what keeps a bad trade small instead of open-ended.",
    href: "/glossary",
    hrefLabel: "More terms explained",
  },
  "paper-account": {
    id: "paper-account",
    mascot: "bear",
    title: "This is practice money",
    body:
      "Orders here go to a simulated account with pretend money. The prices are real, so the results mean something, but nothing you do can cost you anything.",
  },
  "rejected-order": {
    id: "rejected-order",
    mascot: "bear",
    title: "Why an order gets rejected",
    body:
      "The broker refused this one, and the reason is shown on the row. Rejections are normal — usually a price that moved or a size the account cannot cover.",
  },
  "first-guided-card": {
    id: "first-guided-card",
    mascot: "bull",
    title: "Reading a suggestion",
    body:
      "The share count is already worked out from your risk limits, and both dollar figures are for that exact size. Nothing is placed until you confirm on the next screen.",
  },
  "score-badge": {
    id: "score-badge",
    mascot: "bull",
    title: "What the score means",
    body:
      "Every setup is graded out of 9 on trend, structure and risk. Execute means 7 or better with a complete plan; Watch means promising but not ready.",
    href: "/glossary",
    hrefLabel: "More terms explained",
  },
};

export const TIP_IDS = Object.keys(TIPS);

/** Look up a tip, or null. Never throws — a bad id must not break a page. */
export function tipById(id: string): Tip | null {
  return TIPS[id] ?? null;
}
