import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SCANNER_STATE_META } from "@/lib/signals/types";
import { EXECUTE_SCORE_THRESHOLD, WATCH_SCORE_THRESHOLD } from "@/lib/scoring/weights";

interface Term {
  term: string;
  plain: string;
}

/**
 * Stable anchor id for a glossary term, shared by the glossary page (which
 * lands on it) and `<GlossaryTerm>` (which links to it). Kept as one function
 * so the two sides can never drift into different slugs for the same term.
 */
export function glossarySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * A beginner's sentence for each signal state, read before the state's own
 * one-line purpose (2026-10-28: the glossary read through a first-time
 * trader's eyes; "retracement" and "rotational" defined nothing for them).
 */
const STATE_PLAIN: Record<keyof typeof SCANNER_STATE_META, string> = {
  trendPullback:
    "The market is climbing (or falling) steadily and has just paused and slipped back a little, like a hiker stopping for breath partway up a hill; the idea is to join as the climb resumes",
  trendBreakout:
    "Price has been stuck in a narrow band for a while and is now pushing out of it, like a spring released after being pressed down",
  confirmedReversal:
    "A long move looks worn out at an important price, and the market has now actually turned rather than just paused",
  rangeReversion:
    "Price is bouncing between a floor and a ceiling with no trend, so the idea is to buy near the floor and sell near the ceiling",
};

const GROUPS: { heading: string; terms: Term[] }[] = [
  {
    heading: "The trade plan (the colored lines on the chart)",
    terms: [
      {
        term: "Entry (blue line)",
        plain:
          "The price where you get in. Think of it as the door you agreed to walk through: you don't go in until price reaches it. It is one of two kinds. Most often price has already closed a little past an old high (the highest price of an earlier rise; an old low, for a short), and the buy waits on this line just past that old level, filling when price dips back to it. Or the buy waits at an old low that stopped a fall before (an old high, for a short), filling if price comes back down to test it again.",
      },
      {
        term: "Stop loss (red line)",
        plain:
          "Your emergency exit, decided before you get in. If the trade goes the wrong way and price reaches this line, you sell (or buy back, on a short) to keep the loss small, like a smoke alarm that gets you out before the fire spreads. Every trade has one, no exceptions. It is placed with the broker as a stop order, so it works even when you aren't watching, though a price that jumps past the line, overnight or on sudden news, can fill it worse, sometimes much worse.",
      },
      {
        term: "TP1 - Take Profit 1 (green line)",
        plain:
          "Your first profit goal: the next price level ahead where a move often slows down, chosen for this setup so it pays more than the trade risks. It is a signpost, not an automatic sale. GSPS's own trade management doesn't sell there; it keeps the whole position and moves the stop along behind it as the trade gains. You can still choose to take some profit there yourself.",
      },
      {
        term: "MTP - Master Take Profit (green line)",
        plain:
          "The bigger profit goal, further out than TP1: the next key price level beyond it, where the whole move is measured to. Like TP1, nothing sells there automatically. If price pushes through the MTP and then falls back through it, GSPS's trade management reads that as the move being done and closes what's left.",
      },
      {
        term: "Risk-to-reward (like 2:1)",
        plain:
          "Compares what you could lose to what you could gain. 2:1 means you risk $1 to try to make $2, the gap from entry to stop against the gap from entry to target. Higher is better, because a few small losses can then be paid back by one win.",
      },
    ],
  },
  {
    heading: "The grey boxes on the chart (Structural levels)",
    terms: [
      {
        term: "What the grey dashed lines are",
        plain:
          "They mark 'structural levels' - special prices where the market often pauses or turns around. Think of them as hidden floors and ceilings. There are two kinds:",
      },
      {
        term: "Support / resistance line",
        plain:
          "A sloping line GSPS draws forward from a recent high or low, a floor or ceiling that rises or falls with time (see Support and resistance under Trading basics). Price tends to react when it reaches one.",
      },
      {
        term: "Key price level",
        plain:
          "A price GSPS's analysis flags as significant. Like the diagonal lines, it acts as hidden support and resistance.",
      },
      {
        term: "Cyclical turn window",
        plain:
          "Dates when GSPS's analysis suggests a turn is more likely. When you see 'turn window active,' today is near one of those dates.",
      },
      {
        term: "Long-term timing lines up",
        plain:
          "Several of GSPS's long-term timing measures point to this month for this stock. The more that line up, the more worth watching this month is. It's timing context, not a buy or sell signal.",
      },
    ],
  },
  {
    heading: "The verdict (how strong is the setup?)",
    terms: [
      {
        term: "Score out of 9",
        plain:
          "One point for each of nine questions the setup answers yes to: the market and cycle position, the trend on every timeframe, relative strength and leadership, activity, price levels, angles, time, volume and accumulation, and a definite entry signal with the stop placed. Each point needs several of its own conditions to agree, so a point is not easy to earn. The higher the score, the stronger the setup.",
      },
      {
        term: "Execute - Watch - Reject",
        plain: `The bottom line, like a traffic light. Execute (${EXECUTE_SCORE_THRESHOLD} or more, green) = strong, with an entry, stop and targets ready, and price close enough to place it today. Watch (${WATCH_SCORE_THRESHOLD} up to ${EXECUTE_SCORE_THRESHOLD}, yellow) = keep an eye on it; it is still missing something, so there's nothing to act on yet. An Execute-level score that a rule is holding back also shows as Watch, unless the only thing holding it is distance (see Resting order). Reject (below ${WATCH_SCORE_THRESHOLD}, red) = skip it.`,
      },
      {
        term: "Resting order",
        plain:
          "A setup that meets every condition, but whose entry is further from today's price than a normal day's move. It's like leaving a standing order at a shop for an item at a price it isn't selling at yet: the plan waits at its level for price to come back to it. It isn't a trade to take today, and a target that price has already passed only counts once the entry fills.",
      },
      {
        term: "Reversal & continuation patterns",
        plain:
          "GSPS arms a setup when price crosses an old swing top (for a buy) or an old swing bottom (for a sell) by a clear margin, so a bare poke through the level doesn't count. The bar shapes below are shown on the chart as context for reading the last few bars; they don't set the entry price.",
      },
      {
        term: "Failed-push reversal",
        plain:
          "A bar closes clearly up or clearly down, and the very next bar breaks back through its opposite extreme by a penny. That penny break is read as the crowd that pushed the first bar getting trapped and reversing. Moderate confidence on its own — it's the base case the other reversal shapes sharpen.",
      },
      {
        term: "Compressed reversal",
        plain:
          "A failed-push reversal that was preceded by an inside bar (a bar that closed entirely within the prior bar's range). The inside bar means the market paused and compressed before the failed push, which is read as a cleaner trap than a bare failed-push reversal — somewhat higher confidence.",
      },
      {
        term: "Two-sided reversal",
        plain:
          "A failed-push reversal preceded by an outside bar (a bar whose range engulfed the one before it). The outside bar shows both sides were tested hard right before the failed push, which is the highest-confidence version of the failed-push family.",
      },
      {
        term: "Pause continuation",
        plain:
          "A directional bar (up or down) followed by an inside bar, with the trigger set on a break of the inside bar in the same direction the trend was already going. Unlike the failed-push family, this pattern continues the move rather than reversing it — treat it as trend confirmation, not a turn signal.",
      },
      {
        term: "Undecided breakout",
        plain:
          "An outside bar followed by an inside bar. Because the outside bar didn't resolve a direction, the trigger is set both ways (a break of the inside bar's high or its low arms a trade) — the market itself picks the side when one trigger fires. Treat the untriggered side as void once the other fires.",
      },
      {
        term: "Momentum exhaustion reversal",
        plain:
          "Five or more bars in a row making lower highs (or higher lows) — a slow grind in one direction that has trapped a string of traders leaning the other way. The setup arms a trade on the break of the last bar's high or low, betting those trapped positions get stopped out and accelerate the reversal. Read it as a momentum-exhaustion signal: the more consecutive bars, the more trapped positions behind it.",
      },
      {
        term: "Armed vs. triggered",
        plain:
          "'Armed' means there is an old swing top or bottom (the peak or low point of an earlier move) to cross, and the setup is waiting with a trigger price just beyond it, like a mousetrap that is set. 'Triggered' means price has crossed that line by a clear margin and the entry has confirmed on closed bars (bars whose time period is over, so their prices can no longer change), so the trade can be placed. A setup can arm and then never trigger if price never reaches the line. That's not a loss, just a setup that expired unused.",
      },
    ],
  },
  {
    heading: "Trading basics",
    terms: [
      {
        term: "Stock (share)",
        plain:
          "A small piece of ownership in a company. If a company were a pizza cut into a million slices, one share is one slice. Its price moves every day as buyers and sellers agree on what a slice is worth.",
      },
      {
        term: "Bar (candle)",
        plain:
          "One block on the chart that sums up a stretch of time: a day on a daily chart, 15 minutes on a 15-minute chart. Each one shows four prices: where it opened, the highest and lowest it reached, and where it closed. A green candle closed higher than it opened; a red one closed lower.",
      },
      {
        term: "Trend",
        plain:
          "The direction price has been heading. An uptrend climbs like a staircase, each high and each low a step above the last; a downtrend steps down. Sideways means no clear direction.",
      },
      {
        term: "Support and resistance",
        plain:
          "Support is a price where falls have tended to stop, like a floor. Resistance is a price where rises have tended to stall, like a ceiling. When price breaks through a ceiling, that ceiling often becomes the new floor.",
      },
      {
        term: "Volume",
        plain:
          "How many shares changed hands in a bar. High volume means lots of people were trading, so a move on high volume carries more weight than one on a quiet day.",
      },
      {
        term: "Position",
        plain: "A trade you are in right now: the shares you hold (or owe, on a short) until you close it.",
      },
      {
        term: "Long vs. Short",
        plain:
          "Long = you buy first and sell later, betting price goes up. Short = you sell first and buy back later, betting price goes down. Shorting shares you don't own means borrowing them from your broker; see Short sale below.",
      },
      {
        term: "Short sale",
        plain:
          "Selling shares you borrowed, hoping to buy them back cheaper. Like borrowing a friend's $100 concert ticket, selling it, then buying one back for $70 when the price drops and returning it: you keep $30. If the price jumps to $150, you still have to buy one back and you lose $50. Because a price can keep rising, a short always needs a stop. With a real broker it needs a margin account; in your paper account you can practise it freely. The School lesson \"Trading a Sell Setup When You Don't Own the Stock\" walks through it.",
      },
      {
        term: "Margin account",
        plain:
          "A brokerage account that lets you borrow from the broker, either money to buy more than your cash covers or shares to sell short. Brokers ask for an application and usually at least $2,000. A plain cash account or a retirement account such as an IRA can't short.",
      },
      {
        term: "Market, limit and stop orders",
        plain:
          "A market order buys or sells right away at whatever price is available now. A limit order sets the worst price you'll accept and waits until it can fill there, so it may not fill at all. A stop order waits until price reaches a level, then becomes a market order; it's how a stop loss gets you out without you watching.",
      },
      {
        term: "Paper trading",
        plain:
          "Practice trades with pretend money, like a flight simulator for trading, so you can learn how orders, stops and targets behave before risking real funds.",
      },
      {
        term: "Buy at advised price vs. Buy now",
        plain:
          "'At advised price' waits for price to pull back to the entry line and buys there. 'Buy now' buys at the current market price right away.",
      },
    ],
  },
  {
    // BACKLOG.md's "Pattern education" item, the remaining piece of it:
    // the five STRAT reversal/continuation patterns already have their own
    // glossary entries above ("Failed-push reversal" through "Momentum
    // exhaustion reversal") — this was double-checked before adding
    // anything, since duplicating them would collide on `glossarySlug`'s
    // anchor ids. What genuinely had no home anywhere a novice could browse
    // without an active scan result in front of them: the Signal and Regime
    // Engine's four states (`lib/signals/types.ts`'s `SCANNER_STATE_META`),
    // which had only a one-line `purpose` used inline in the score
    // breakdown UI. Copy below is that same existing `purpose` text, not
    // newly written here.
    heading: "Signal states (what regime GSPS thinks a symbol is in)",
    terms: Object.values(SCANNER_STATE_META).map((meta) => ({
      term: meta.label,
      plain: `${STATE_PLAIN[meta.name]}.`,
    })),
  },
];

/** Every term the glossary defines, for callers that want to validate a link. */
export const GLOSSARY_TERMS: ReadonlySet<string> = new Set(
  GROUPS.flatMap((g) => g.terms.map((t) => t.term)),
);

export function Glossary() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {GROUPS.map((g, i) => (
        <Card key={g.heading} data-tour={i === 0 ? "glossary-terms" : undefined}>
          <CardHeader>
            <CardTitle>{g.heading}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              {g.terms.map((t) => (
                // scroll-mt clears the sticky app nav so a deep link doesn't
                // land the term underneath it.
                <div key={t.term} id={glossarySlug(t.term)} className="scroll-mt-20">
                  <dt className="text-sm font-semibold">{t.term}</dt>
                  <dd className="text-sm text-muted">{t.plain}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Compact collapsible version for embedding under a chart. */
export function GlossaryDetails() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New to this? What the terms mean</CardTitle>
        <CardDescription>
          Plain-language definitions of every line, box, and score on this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g.heading}>
              <h4 className="mb-2 text-sm font-semibold">{g.heading}</h4>
              <dl className="flex flex-col gap-2.5">
                {g.terms.map((t) => (
                  <div key={t.term}>
                    <dt className="text-sm font-medium">{t.term}</dt>
                    <dd className="text-sm text-muted">{t.plain}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
