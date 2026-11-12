"use client";

/**
 * Fed policy meetings for the macro calendar (Q3 plan item 6;
 * `lib/macro/fomc.ts`). Dates only: GSPS shows when a meeting falls, never
 * what to expect from it.
 *
 * `FedMeetingsCard` lists the next four on the Dashboard; `FedMeetingNotice`
 * is the one-line note a symbol page shows when a meeting is under way or
 * within the week.
 */

import { useState } from "react";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FOMC_READ_ON,
  FOMC_SOURCE_URL,
  daysBetween,
  etToday,
  fomcLabel,
  fomcNear,
  fomcScheduleExhausted,
  upcomingFomc,
  type FomcMeeting,
} from "@/lib/macro/fomc";

function when(today: string, x: FomcMeeting): string {
  if (x.start <= today && today <= x.end) return "Under way";
  const d = daysBetween(today, x.start);
  if (d === 1) return "Tomorrow";
  return `In ${d} days`;
}

export function FedMeetingsCard() {
  // Read once on mount; the list only moves at a day's turn.
  const [today] = useState(() => etToday());
  const next = upcomingFomc(today, 4);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-muted" aria-hidden />
          Fed policy meetings
        </CardTitle>
        <CardDescription>
          The Federal Reserve&apos;s scheduled rate meetings. Markets can move sharply around the decision; the dates
          are shown so you know when, not what to expect.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {fomcScheduleExhausted(today) ? (
          <p className="text-sm text-muted">The next meetings aren&apos;t listed yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {next.map((x) => (
              <li key={x.start} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-28 font-medium tabular-nums">{fomcLabel(x)}</span>
                <span className="text-muted">{when(today, x)}</span>
                {x.projections && <Badge variant="muted">With projections</Badge>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">
          Source:{" "}
          <a href={FOMC_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            federalreserve.gov
          </a>
          , read {FOMC_READ_ON}. Unscheduled meetings aren&apos;t known in advance.
        </p>
      </CardContent>
    </Card>
  );
}

export function FedMeetingNotice() {
  const [today] = useState(() => etToday());
  const near = fomcNear(today, 7);
  if (!near) return null;
  return (
    <p className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm" role="note">
      <Landmark className="size-4 shrink-0 text-muted" aria-hidden />
      <span>
        Fed policy meeting {fomcLabel(near)} ({when(today, near).toLowerCase()}). Markets can move sharply around the
        decision.
      </span>
    </p>
  );
}
