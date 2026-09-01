"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

// A small, fixed rotation is enough to feel "daily" without a database table
// or a copywriting CMS — the day-of-year picks the same message all day and a
// different one tomorrow, no server round trip required.
const MESSAGES = [
  "Trade the plan, not the feeling. One good setup beats ten guesses.",
  "Discipline compounds faster than any single trade.",
  "Protect capital first — the next setup is always coming.",
  "A small, well-managed loss is a normal cost of doing business.",
  "Consistency beats intensity. Show up, follow the process.",
  "The market rewards patience more often than prediction.",
  "Every trade is a data point, not a verdict on you.",
  "Cut losers fast, let winners work — the oldest edge still works.",
  "Your risk plan is the product; the trade is just an instance of it.",
  "Good process, bad outcome is still good process.",
  "Confidence comes from preparation, not from being right last time.",
  "The best traders are professional risk managers first.",
  "Slow is smooth, smooth is fast — don't force a setup that isn't there.",
  "You don't need to trade every day to be a trader.",
];

function dailyMessage(date: Date): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  return MESSAGES[dayOfYear % MESSAGES.length];
}

export function WelcomeBanner() {
  const [now, setNow] = useState<Date | null>(null);

  // Syncs the displayed clock with the browser's own time/timezone, which
  // the server render can't know.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Render nothing time-dependent until mounted, so the server-rendered
  // shell never disagrees with the browser's own clock/timezone on hydration.
  if (!now) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
          <p className="text-sm font-medium">{dailyMessage(new Date())}</p>
        </CardContent>
      </Card>
    );
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
  const tzAbbrev = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
        <p className="text-sm font-medium">{dailyMessage(now)}</p>
        <p className="shrink-0 text-xs text-muted" title={timeZone}>
          {dateLabel} · {timeLabel}
          {tzAbbrev ? ` ${tzAbbrev}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}
