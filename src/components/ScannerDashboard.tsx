"use client";

import { useEffect, useState } from "react";
import type { ScanStatus } from "@/lib/scanner/cache";
import type { ScanResult } from "@/lib/scanner/types";

interface Payload {
  bullishReversions: ScanResult[];
  bearishReversions: ScanResult[];
  summary: { execute: number; watch: number; reject: number };
}

interface StatusResponse {
  status: ScanStatus;
  message: string;
  completedAt: string | null;
  payload: Payload | null;
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
  // Result from a manual "Run scan now" — displayed directly so it works even on
  // serverless where the shared cache may be cold on the next request.
  const [manualPayload, setManualPayload] = useState<Payload | null>(null);
  const [running, setRunning] = useState(false);

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

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/scanner/run", { method: "POST" });
      const json = await res.json();
      if (json?.ok && json.payload) setManualPayload(json.payload as Payload);
    } catch {
      /* surfaced via status message on next poll */
    } finally {
      setRunning(false);
    }
  };

  const payload = manualPayload ?? data.payload;
  const hasResults = payload != null;

  return (
    <section>
      <div className="mb-6 rounded-xl border border-[#20252f] bg-canvas-raised p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <StatusDot status={running ? "RUNNING" : data.status} />
            <span className="text-sm">
              {running ? "Scanning the market for today's best reversion setups…" : data.message}
            </span>
          </div>
          <button
            onClick={runNow}
            disabled={running}
            className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {running ? "Running…" : "Run scan now"}
          </button>
        </div>
        {data.completedAt && !manualPayload && (
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
            rows={payload!.bullishReversions}
          />
          <ReversionColumn
            title="Bearish Reversions"
            accent="bear"
            rows={payload!.bearishReversions}
          />
        </div>
      ) : (
        <EmptyState onRun={runNow} running={running} />
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
            <li key={r.symbol}>
              <a
                href={`/chart?ticker=${r.symbol}`}
                className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-sm transition hover:bg-black/40"
              >
                <span className="font-medium">{r.symbol}</span>
                <span className="text-xs text-[#b5bcc8]">
                  {r.decision.score}/9 · {r.decision.outputState}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onRun, running }: { onRun: () => void; running: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-[#2a2f3a] p-8 text-center">
      <p className="text-sm text-[#8b93a1]">
        Setups appear here automatically after the market-close scan.
      </p>
      <button
        onClick={onRun}
        disabled={running}
        className="mt-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
      >
        {running ? "Running…" : "Run a scan now"}
      </button>
    </div>
  );
}
