"use client";

import { useEffect, useState } from "react";
import type { ScanStatus } from "@/lib/scanner/cache";
import type { ScanResult } from "@/lib/scanner/types";

interface StatusResponse {
  status: ScanStatus;
  message: string;
  completedAt: string | null;
  payload: {
    bullishReversions: ScanResult[];
    bearishReversions: ScanResult[];
    summary: { execute: number; watch: number; reject: number };
  } | null;
}

export function ScannerDashboard({
  initialStatus,
  initialMessage,
}: {
  initialStatus: ScanStatus;
  initialMessage: string;
}) {
  const [data, setData] = useState<StatusResponse>({
    status: initialStatus,
    message: initialMessage,
    completedAt: null,
    payload: null,
  });

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/scanner/status", { cache: "no-store" });
        const json = (await res.json()) as StatusResponse;
        if (alive) setData(json);
      } catch {
        /* keep last known state */
      }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const hasResults = data.payload != null;

  return (
    <section>
      <div className="mb-6 rounded-xl border border-[#20252f] bg-canvas-raised p-4">
        <div className="flex items-center gap-2">
          <StatusDot status={data.status} />
          <span className="text-sm">{data.message}</span>
        </div>
        {data.completedAt && (
          <p className="mt-1 text-xs text-[#8b93a1]">
            Last completed: {new Date(data.completedAt).toLocaleString()}
          </p>
        )}
      </div>

      {hasResults ? (
        <div className="grid gap-4 md:grid-cols-2">
          <ReversionColumn
            title="Bullish Reversions"
            accent="bull"
            rows={data.payload!.bullishReversions}
          />
          <ReversionColumn
            title="Bearish Reversions"
            accent="bear"
            rows={data.payload!.bearishReversions}
          />
        </div>
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

function StatusDot({ status }: { status: ScanStatus }) {
  const color =
    status === "FRESH"
      ? "bg-bull"
      : status === "ERROR"
        ? "bg-bear"
        : status === "RUNNING"
          ? "bg-accent"
          : "bg-[#5a616e]";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function ReversionColumn({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: "bull" | "bear";
  rows: ScanResult[];
}) {
  const bg = accent === "bull" ? "bg-bull-bg" : "bg-bear-bg";
  const text = accent === "bull" ? "text-bull-soft" : "text-bear-soft";
  // Direction glyph so state is not conveyed by color alone (S-7, a11y).
  const glyph = accent === "bull" ? "▲" : "▼";
  return (
    <div className={`rounded-xl border border-[#20252f] ${bg} p-4`}>
      <h2 className={`mb-3 text-sm font-semibold ${text}`}>
        {glyph} {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-xs text-[#8b93a1]">No setups this run.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.symbol}
              className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm"
            >
              <span className="font-medium">{r.symbol}</span>
              <span className="text-xs text-[#b5bcc8]">
                {r.decision.score}/9 · {r.decision.outputState}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[#2a2f3a] p-8 text-center">
      <p className="text-sm text-[#8b93a1]">
        Setups will appear here automatically after the next market-close scan.
      </p>
    </div>
  );
}
