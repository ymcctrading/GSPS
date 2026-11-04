"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import type { GroupStanding, GroupView } from "@/lib/scanner/groupView";
import { tickerHref } from "@/lib/routes";

/**
 * The Scanner's Groups tab (Q3 item 3): industry groups by standing, each
 * opening to its stocks in rank order, and the universe's breadth. Display
 * only, read from the same ranking the scan uses: see
 * `lib/scanner/groupView.ts`. It shows positions and ranks, never a pass or
 * fail, since a stock's rank is one of several things a setup is checked for.
 */

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function formatMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function GroupStandings() {
  const [data, setData] = useState<GroupView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/groups")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`,
          );
        if (live) setData(body as GroupView);
      })
      .catch(
        (err) =>
          live && setError(err instanceof Error ? err.message : String(err)),
      );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Industry groups</CardTitle>
          <CardDescription>
            Groups ranked by where their stocks stand in their last twelve
            months&apos; range, strongest first. Open a group to see its stocks
            in the same order. Monthly closes only, so the ranking changes once
            a month.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-sm text-bear">{error}</p>}
          {!data && !error && <p className="text-sm text-muted">Loading…</p>}
          {data && (
            <>
              <BreadthLine view={data} />
              <div
                className="flex items-center gap-3 px-3 text-xs text-muted"
                aria-hidden="true"
              >
                <span className="w-7 shrink-0 text-right">#</span>
                <span className="flex-1">Group</span>
                <span className="w-24 shrink-0 text-right">Standing</span>
              </div>
              <ul className="-mt-2 flex flex-col divide-y divide-border rounded-md border border-border">
                {data.groups.map((g, i) => (
                  <GroupRow
                    key={g.key}
                    group={g}
                    place={g.standing === null ? null : i + 1}
                    of={data.breadth.groups}
                    open={open === g.key}
                    onToggle={() => setOpen(open === g.key ? null : g.key)}
                  />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BreadthLine({ view }: { view: GroupView }) {
  const { breadth } = view;
  return (
    <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-md border border-border p-3">
        <div className="text-muted">
          Stocks in the upper half of their range
        </div>
        <div className="text-lg font-semibold">
          {breadth.stocksUpperHalf} of {breadth.stocks}
          {breadth.stocks > 0 && (
            <span className="ml-2 text-sm font-normal text-muted">
              {pct(breadth.stocksUpperHalf / breadth.stocks)}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-md border border-border p-3">
        <div className="text-muted">
          Ranked groups whose middle stock is in the upper half
        </div>
        <div className="text-lg font-semibold">
          {breadth.groupsUpperHalf} of {breadth.groups}
        </div>
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        Read from monthly closes through the end of the month before{" "}
        {formatMonth(view.month)}.
      </p>
    </div>
  );
}

function GroupRow({
  group,
  place,
  of,
  open,
  onToggle,
}: {
  group: GroupStanding;
  place: number | null;
  of: number;
  open: boolean;
  onToggle: () => void;
}) {
  const tableId = `group-${group.key.replace(/[^a-z0-9-]/gi, "-")}`;
  const spoken =
    group.standing === null
      ? `${group.label}, too few to rank, ${group.members.length} stocks`
      : `${group.label}, ${place} of ${of}, ${group.members.length} stocks, standing ${pct(group.standing)}`;
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={tableId}
        aria-label={spoken}
        className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
      >
        <span className="w-7 shrink-0 text-right tabular-nums text-muted">
          {place ?? "–"}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {group.label}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {group.members.length} stocks
        </span>
        <span className="w-24 shrink-0 text-right tabular-nums">
          {group.standing === null ? (
            <span className="text-xs text-muted">Too few to rank</span>
          ) : (
            pct(group.standing)
          )}
        </span>
      </button>
      {open && (
        <div id={tableId} className="overflow-x-auto">
          <table className="mb-2 w-full text-sm">
            <caption className="sr-only">
              Stocks in {group.label}, strongest first
            </caption>
            <thead>
              <tr className="text-xs text-muted">
                <th className="px-2 py-1 text-right font-normal">#</th>
                <th className="px-2 py-1 text-left font-normal">Symbol</th>
                <th className="px-2 py-1 text-right font-normal">
                  In its range
                </th>
                <th className="px-2 py-1 text-right font-normal">Among all</th>
              </tr>
            </thead>
            <tbody>
              {group.members.map((m) => (
                <tr key={m.symbol}>
                  <td className="px-2 py-1 text-right tabular-nums text-muted">
                    {m.groupRank}
                  </td>
                  <td className="px-2 py-1">
                    <Link
                      href={tickerHref(m.symbol)}
                      className="font-medium text-accent hover:underline"
                    >
                      {m.symbol}
                    </Link>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {pct(m.position)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {pct(m.universePercentile)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
