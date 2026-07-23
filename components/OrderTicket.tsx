"use client";

import { useState } from "react";
import { usd } from "@/lib/format";

type Result =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; status: string }
  | { kind: "error"; message: string };

export function OrderTicket({
  symbol,
  entry,
  stop,
  tp1,
  direction,
}: {
  symbol: string;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  direction: string;
}) {
  const [mode, setMode] = useState<"advised" | "market">("advised");
  const [qty, setQty] = useState(1);
  const [attach, setAttach] = useState(true);
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const side = direction === "bearish" ? "sell" : "buy";
  const sideLabel = side === "sell" ? "Sell" : "Buy";

  async function placeOrder() {
    setResult({ kind: "loading" });
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          qty,
          side,
          entryType: mode,
          limitPrice: entry,
          attachBracket: attach,
          stop,
          tp1,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResult({ kind: "error", message: json.error ?? "Order failed" });
        return;
      }
      setResult({ kind: "ok", status: json.status ?? "accepted" });
    } catch (err) {
      setResult({ kind: "error", message: String(err) });
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Order ticket · paper</h2>
      <p className="mt-1 text-sm text-slate-500">
        {sideLabel === "Sell" ? "Short" : "Long"} {symbol} per the armed 2-2 setup.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("advised")}
          className={`rounded-lg border p-3 text-left text-sm ${
            mode === "advised" ? "border-brand-blue bg-blue-50" : "border-[var(--border)]"
          }`}
        >
          <div className="font-semibold">At advised price</div>
          <div className="tabular text-slate-500">{usd(entry, { dash: true })}</div>
        </button>
        <button
          type="button"
          onClick={() => setMode("market")}
          className={`rounded-lg border p-3 text-left text-sm ${
            mode === "market" ? "border-brand-blue bg-blue-50" : "border-[var(--border)]"
          }`}
        >
          <div className="font-semibold">Buy now (market)</div>
          <div className="tabular text-slate-500">Market</div>
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-slate-500">Quantity</span>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 tabular"
        />
      </label>

      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={attach}
          onChange={(e) => setAttach(e.target.checked)}
          className="mt-1"
        />
        <span>
          Attach protocol stop ({usd(stop, { dash: true })}) and TP1 (
          {usd(tp1, { dash: true })})
        </span>
      </label>

      <button
        type="button"
        onClick={placeOrder}
        disabled={result.kind === "loading"}
        className="mt-4 w-full rounded-lg bg-brand-up py-3 font-bold text-white transition-colors hover:brightness-95 disabled:opacity-60"
      >
        {result.kind === "loading" ? "Placing…" : `${sideLabel} ${symbol}`}
      </button>

      {result.kind === "ok" && (
        <p className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
          Paper order submitted — status: {result.status}. See it in Portfolio.
        </p>
      )}
      {result.kind === "error" && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {result.message}
        </p>
      )}

      <p className="mt-3 text-xs text-slate-400">
        Orders route to your paper account. Connect a live brokerage in Settings to trade real
        funds.
      </p>
    </div>
  );
}

export default OrderTicket;
