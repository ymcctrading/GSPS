/**
 * GSPS — "How do I trade a sell setup?" (owner, 2026-10-28).
 *
 * A novice asked how to act on a sell setup without owning the stock. This
 * is the short answer every surface that shows a Novice a sell setup carries
 * (`components/education/sell-setup-help.tsx`): the Dashboard's Sell list and
 * its full page, the Novice home's Today's plan when it is a sell, the
 * Scanner's Sell results, Guided Mode's short, and the order ticket's short
 * sale, which is how the ticker page's sell plan carries it. Stated
 * exception: the tracked and saved lists, which mix both sides in one list
 * and are reached after the Sell list has already shown the note. The School
 * lesson (`SELL_SETUP_LESSON_ID`, Academy 1, optional so it gates nothing)
 * teaches the same ground at length.
 *
 * Plain, neutral education: no method names, no performance claims. Shipped
 * to the browser, so it must stay free of the confidential sources
 * (AGENTS.md, "Confidential sources").
 *
 * Mandate: question 1 (sourcing) does not apply, this is general brokerage
 * education. Question 2 makes no periodicity claim. Question 3, Polarity: a
 * sell setup is the buy setup's other pole, and a novice can only use both
 * poles once the mechanics of the short side are as plain as the long side's.
 * Law of Creation: novice ⊗ sell setup is a mixture (a signal they can't act
 * on) until the explanation joins them; the created third is a trader who can
 * choose how, or whether, to act on it.
 */

export const SELL_SETUP_LESSON_ID = "academy-1/orientation/selling-without-owning";

export const SELL_SETUP_LESSON_HREF = `/school/lesson/${SELL_SETUP_LESSON_ID}`;

export const SELL_SETUP_HELP = {
  title: "How do I trade a sell setup?",
  analogy:
    "Think of a concert ticket. A friend lends you theirs while tickets sell for $100, and you sell it. When the price drops to $70, you buy one back, give it to your friend, and keep the $30. If the price jumps to $150 instead, you still have to buy one back, and you lose $50.",
  shortSale:
    "With a stock, that is a short sale: your broker lends you the shares, you sell them now and buy them back later to return them. You gain if the price falls and lose if it rises.",
  needs: [
    "A margin account. A plain cash account or an IRA can't short, and many brokers ask for $2,000 or more and an approval step.",
    "A borrowing fee for each day you hold the short, small for most stocks but large for hard-to-borrow ones, and you pay any dividend the stock pays while you're short.",
    "A stop loss, always. A price can keep rising, so a short's loss has no ceiling unless you set where you buy back. Even a stop can fill worse than planned if the price jumps past it overnight.",
  ],
  alternativesIntro: "Other ways to act on a sell setup:",
  alternatives: [
    "Buy a put option. It gains when the price falls far enough before it expires, and the most you can lose is what you paid.",
    "Buy an inverse fund if the sell setup is on the whole market. Most are built to rise when the market falls over a single day, so held for weeks they can drift from that.",
    "If you already own the stock, use it as your cue to take profits or tighten your stop.",
    "Skip it. Many beginners trade only buy setups at first, and that's fine.",
  ],
  practice: "You can practise a short in your GSPS paper account first, with no real money and no margin account needed.",
  lessonLink: "Read the full lesson",
} as const;
