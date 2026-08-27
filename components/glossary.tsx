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
          "Your first profit goal, set by GSPS's analysis for this specific setup. Where it sits varies trade to trade rather than following one fixed rule.",
      },
      {
        term: "Final target (green line)",
        plain:
          "The bigger profit goal — further out than TP1, and adjusted to the nearest key price level GSPS finds in range. You'd typically take most profit at TP1 and let a small piece run toward this.",
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
        term: "Support / resistance line",
        plain:
          "A diagonal price line GSPS projects forward from a recent high or low. Price tends to react when it reaches one.",
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
        term: "Reversal pattern",
        plain:
          "A candlestick pattern that hints price may be about to flip direction — for example, price pushing one way and then breaking back the other.",
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
