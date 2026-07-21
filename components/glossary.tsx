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
          "The price where the trade turns on. If price crosses this line, the setup is “triggered” and that’s where you’d get in.",
      },
      {
        term: "Stop loss (red line)",
        plain:
          "Your safety exit. If the trade goes the wrong way and price reaches here, you get out to keep the loss small. Every trade has one — no exceptions.",
      },
      {
        term: "TP1 — Take Profit 1 (green line)",
        plain:
          "Your first profit goal. It’s set so you aim to make about 2× what you’re risking. That’s a 2-to-1 reward-to-risk ratio.",
      },
      {
        term: "Master profit (green line)",
        plain:
          "The bigger profit goal, aiming for about 3× your risk (3-to-1). You’d typically take most profit at TP1 and let a small piece run toward this.",
      },
      {
        term: "Risk-to-reward (like 2:1)",
        plain:
          "Compares what you could lose to what you could gain. 2:1 means you risk $1 to try to make $2. Higher is better.",
      },
    ],
  },
  {
    heading: "The grey boxes on the chart (Gann levels)",
    terms: [
      {
        term: "What the grey dashed lines are",
        plain:
          "They mark “Gann levels” — special prices where the market often pauses or turns around. Think of them as hidden floors and ceilings. There are two kinds:",
      },
      {
        term: "Gann fan line (1x1, 1x2, 1x4…)",
        plain:
          "Diagonal support/resistance angles drawn from a recent high or low. Price tends to react when it reaches one. The numbers are just the steepness of the angle.",
      },
      {
        term: "Square of 9 (S9 45°, 90°, …)",
        plain:
          "Price levels from a Gann math “wheel” built on square roots. Like the fan lines, they act as hidden support and resistance.",
      },
      {
        term: "Gann time-cycle window",
        plain:
          "Dates when Gann’s math says a turn is more likely. When you see “time-cycle window active,” today is near one of those dates.",
      },
    ],
  },
  {
    heading: "The verdict (how strong is the setup?)",
    terms: [
      {
        term: "Score out of 9",
        plain:
          "How many of 9 quality checks the setup passes (trend, Gann levels, pattern, risk, etc.). The higher the score, the stronger the setup.",
      },
      {
        term: "Execute · Watch · Reject",
        plain:
          "The bottom line. Execute (7–9) = strong, worth acting on. Watch (4–6) = keep an eye on it. Reject (0–3) = skip it.",
      },
      {
        term: "Strat pattern (2-2, 2-1-2, PMG…)",
        plain:
          "A candlestick pattern that hints price may be about to flip direction. A “2-2 reversal,” for example, means price pushed one way and then broke back the other.",
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
          "“At advised price” waits to buy exactly at the entry line. “Buy now” buys at the current market price right away.",
      },
    ],
  },
];

export function Glossary() {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => (
        <Card key={g.heading}>
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
