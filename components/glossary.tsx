import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface Term {
  term: string;
  plain: string;
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
        term: "Final target (green line)",
        plain:
          "The bigger profit goal — roughly 2.5x your risk on stocks, 3x on crypto by default, then snapped to the nearest support or key price level in range. You'd typically take most profit at TP1 and let a small piece run toward this.",
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
        term: "Key price level (45, 90, ...)",
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
        term: "Reversal pattern (2-2, 2-1-2, PMG...)",
        plain:
          "A candlestick pattern that hints price may be about to flip direction. A '2-2 reversal,' for example, means price pushed one way and then broke back the other.",
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
                <div key={t.term}>
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
