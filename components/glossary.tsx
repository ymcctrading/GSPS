import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

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

const GROUPS: { heading: string; terms: Term[] }[] = [
  {
    heading: "The trade plan (the colored lines on the chart)",
    terms: [
      {
        term: "Entry (blue line)",
        plain:
          "The price where the trade turns on. If price crosses this line, the setup is 'triggered' and that's where you'd get in.",
      },
      {
        term: "Stop loss (red line)",
        plain:
          "Your safety exit. If the trade goes the wrong way and price reaches here, you get out to keep the loss small. Every trade has one - no exceptions.",
      },
      {
        term: "TP1 - Take Profit 1 (green line)",
        plain:
          "Your first profit goal. It defaults to about 1.5x what you're risking, but can sit further out if the prior candle's high/low gives a better structural target — so the actual multiple varies trade to trade.",
      },
      {
        term: "Master profit (green line)",
        plain:
          "The bigger profit goal — roughly 2.5x your risk on stocks, 3x on crypto by default, then snapped to the nearest support or harmonic level in range. You'd typically take most profit at TP1 and let a small piece run toward this.",
      },
      {
        term: "Risk-to-reward (like 2:1)",
        plain:
          "Compares what you could lose to what you could gain. 2:1 means you risk $1 to try to make $2. Higher is better.",
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
        term: "Support line (1x1, 1x2, 1x4...)",
        plain:
          "Diagonal support/resistance angles drawn from a recent high or low. Price tends to react when it reaches one. The numbers are just the steepness of the angle.",
      },
      {
        term: "Harmonic level (45, 90, ...)",
        plain:
          "Price levels derived from mathematical ratios and square roots. Like the support lines, they act as hidden support and resistance.",
      },
      {
        term: "Cyclical turn window",
        plain:
          "Dates when structural math suggests a turn is more likely. When you see 'turn window active,' today is near one of those dates.",
      },
    ],
  },
  {
    heading: "The verdict (how strong is the setup?)",
    terms: [
      {
        term: "Score out of 9",
        plain:
          "How many of 9 quality checks the setup passes (trend, structural levels, pattern, risk, etc.). The higher the score, the stronger the setup.",
      },
      {
        term: "Execute - Watch - Reject",
        plain:
          "The bottom line. Execute (7-9) = strong and has a valid entry/stop/target ready to trade. Watch (4-6) = keep an eye on it — a 7-9 score with no armed trade plan also shows as Watch, since there's nothing to act on yet. Reject (0-3) = skip it.",
      },
      {
        term: "Reversal & continuation patterns",
        plain:
          "GSPS arms a setup off the shape of the last two or three closed bars, then waits for the next bar to break a trigger price by one penny. Each shape below is one of those setups — expand a pattern card on the scan page for the plain-language version of the one that's currently armed.",
      },
      {
        term: "2-2 reversal",
        plain:
          "A bar closes clearly up or clearly down, and the very next bar breaks back through its opposite extreme by a penny. That penny break is read as the crowd that pushed the first bar getting trapped and reversing. Moderate confidence on its own — it's the base case the other reversal shapes sharpen.",
      },
      {
        term: "1-2-2 reversal",
        plain:
          "A 2-2 reversal that was preceded by an inside bar (a bar that closed entirely within the prior bar's range). The inside bar means the market paused and compressed before the failed push, which is read as a cleaner trap than a bare 2-2 — somewhat higher confidence.",
      },
      {
        term: "3-2-2 reversal",
        plain:
          "A 2-2 reversal preceded by an outside bar (a bar whose range engulfed the one before it). The outside bar shows both sides were tested hard right before the failed push, which is the highest-confidence version of the 2-2 family.",
      },
      {
        term: "2-1-2 continuation",
        plain:
          "A directional bar (up or down) followed by an inside bar, with the trigger set on a break of the inside bar in the same direction the trend was already going. Unlike the 2-2 family, this pattern continues the move rather than reversing it — treat it as trend confirmation, not a turn signal.",
      },
      {
        term: "3-1-2 setup",
        plain:
          "An outside bar followed by an inside bar. Because the outside bar didn't resolve a direction, the trigger is set both ways (a break of the inside bar's high or its low arms a trade) — the market itself picks the side when one trigger fires. Treat the untriggered side as void once the other fires.",
      },
      {
        term: "Momentum reversal (PMG)",
        plain:
          "Five or more bars in a row making lower highs (or higher lows) — a slow grind in one direction that has trapped a string of traders leaning the other way. The setup arms a trade on the break of the last bar's high or low, betting those trapped positions get stopped out and accelerate the reversal. Read it as a momentum-exhaustion signal: the more consecutive bars, the more trapped positions behind it.",
      },
      {
        term: "Armed vs. triggered",
        plain:
          "'Armed' means the pattern has formed on the last closed bar and is waiting with a trigger price. 'Triggered' means the live candle has broken that price by a penny and the trade is live. A pattern can arm and then never trigger if price never reaches the line — that's not a loss, just a setup that expired unused.",
      },
    ],
  },
  {
    heading: "Trading basics",
    terms: [
      {
        term: "Long vs. Short",
        plain: "Long = betting price goes up. Short = betting price goes down.",
      },
      {
        term: "Paper trading",
        plain:
          "Practice trades with pretend money so you can test the system safely before risking real funds.",
      },
      {
        term: "Buy at advised price vs. Buy now",
        plain:
          "'At advised price' waits to buy exactly at the entry line. 'Buy now' buys at the current market price right away.",
      },
    ],
  },
];

/** Every term the glossary defines, for callers that want to validate a link. */
export const GLOSSARY_TERMS: ReadonlySet<string> = new Set(
  GROUPS.flatMap((g) => g.terms.map((t) => t.term)),
);

export function Glossary() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {GROUPS.map((g) => (
        <Card key={g.heading}>
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
