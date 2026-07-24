"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";

type EntryMode = "advised" | "now";
type AssetType = "shares" | "options";
type Side = "buy" | "sell";
type OptionType = "call" | "put";

interface StrikeRow {
  strike: number;
  call?: string;
  put?: string;
}
interface ExpiryGroup {
  expiration: string;
  strikes: StrikeRow[];
}
interface OptionChain {
  underlying: string;
  price: number | null;
  expirations: ExpiryGroup[];
}

export function OrderTicket({
  result,
  livePrice,
}: {
  result: ScanResult;
  livePrice?: number | null;
}) {
  const { levels, pattern, symbol } = result;
  const currentPrice = livePrice ?? (result.currentPrice > 0 ? result.currentPrice : null);

  const signalSide: Side = pattern?.direction === "bearish" ? "sell" : "buy";

  const [assetType, setAssetType] = useState<AssetType>("shares");
  const [side, setSide] = useState<Side>(signalSide);
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; code?: string } | null>(null);

  // Options chain state.
  const [optionType, setOptionType] = useState<OptionType>(signalSide === "sell" ? "put" : "call");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [chainStatus, setChainStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [chainError, setChainError] = useState("");
  const [expiration, setExpiration] = useState("");
  const [contractSymbol, setContractSymbol] = useState("");

  const advised = levels?.entry ?? 0;

  // Find the near-the-money contract symbol for a given expiration + call/put.
  const pickAtm = useCallback(
    (c: OptionChain | null, exp: string, type: OptionType): string => {
      const group = c?.expirations.find((e) => e.expiration === exp);
      if (!group) return "";
      const rows = group.strikes.filter((r) => (type === "call" ? r.call : r.put));
      if (rows.length === 0) return "";
      const ref = c?.price ?? currentPrice ?? rows[Math.floor(rows.length / 2)].strike;
      const atm = rows.reduce((best, r) =>
        Math.abs(r.strike - ref) < Math.abs(best.strike - ref) ? r : best,
      );
      return (type === "call" ? atm.call : atm.put) ?? "";
    },
    [currentPrice],
  );

  const loadChain = useCallback(async () => {
    setChainStatus("loading");
    setChainError("");
    try {
      const url = `/api/options/chain?symbol=${encodeURIComponent(symbol)}${
        currentPrice ? `&price=${currentPrice}` : ""
      }`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const c = data as OptionChain;
      const first = c.expirations[0]?.expiration ?? "";
      setChain(c);
      setExpiration(first);
      setContractSymbol(pickAtm(c, first, optionType));
      setChainStatus("ready");
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
      setChainStatus("error");
    }
  }, [symbol, currentPrice, optionType, pickAtm]);

  // Switching to the Options tab lazily loads the chain once.
  const openOptions = () => {
    setAssetType("options");
    if (chainStatus === "idle") loadChain();
  };

  const changeExpiration = (exp: string) => {
    setExpiration(exp);
    setContractSymbol(pickAtm(chain, exp, optionType));
  };
  const changeOptionType = (type: OptionType) => {
    setOptionType(type);
    setContractSymbol(pickAtm(chain, expiration, type));
  };

  const activeExpiry = chain?.expirations.find((e) => e.expiration === expiration);

  if (!levels || !pattern) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Order ticket</CardTitle>
          <CardDescription>
            No armed setup — the protocol only authorizes entries off a live trigger line.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function submit() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const body =
        assetType === "options"
          ? {
              symbol: contractSymbol,
              assetClass: "option" as const,
              side,
              qty: Number(qty),
              entryMode: "now" as const,
              mode: "paper" as const,
            }
          : {
              symbol,
              assetClass: "equity" as const,
              side,
              qty: Number(qty),
              entryMode,
              limitPrice: entryMode === "advised" ? advised : undefined,
              // Brackets only attach to long entries.
              attachLevels:
                attachLevels && side === "buy"
                  ? { stopLoss: levels!.stopLoss, takeProfit: levels!.takeProfit1, masterProfit: levels!.masterProfit }
                  : undefined,
              mode: "paper" as const,
            };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? `HTTP ${res.status}`, code: data.code });
        return;
      }
      setFeedback({ ok: true, text: `Paper order placed — ${data.order?.status ?? "accepted"}.` });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const optionRows = activeExpiry?.strikes.filter((r) => (optionType === "call" ? r.call : r.put)) ?? [];
  const canSubmitOptions = assetType === "options" && !!contractSymbol;
  const disabled =
    submitting || Number(qty) < 1 || (assetType === "options" && !canSubmitOptions);

  const actionLabel = (() => {
    if (assetType === "options") return `Buy to ${side === "buy" ? "open" : "close"} ${optionType.toUpperCase()}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell short ${symbol}`;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order ticket · paper</CardTitle>
        <CardDescription>
          {assetType === "options"
            ? `Trade ${symbol} options — protocol read is ${pattern.direction}.`
            : `${side === "buy" ? "Long" : "Short"} ${symbol} — armed ${pattern.name} setup is ${pattern.direction}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Shares vs Options */}
        <div className="grid grid-cols-2 gap-2">
          <TabButton active={assetType === "shares"} onClick={() => setAssetType("shares")} label="Shares" />
          <TabButton active={assetType === "options"} onClick={openOptions} label="Options" />
        </div>

        {/* Buy / Sell side */}
        <div className="grid grid-cols-2 gap-2">
          <SideButton
            active={side === "buy"}
            tone="bull"
            onClick={() => setSide("buy")}
            title={assetType === "options" ? "Buy to open" : "Buy / Long"}
            hint={signalSide === "buy" ? "protocol side" : undefined}
          />
          <SideButton
            active={side === "sell"}
            tone="bear"
            onClick={() => setSide("sell")}
            title={assetType === "options" ? "Sell to open" : "Sell / Short"}
            hint={signalSide === "sell" ? "protocol side" : undefined}
          />
        </div>

        {assetType === "shares" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={entryMode === "advised"}
                onClick={() => setEntryMode("advised")}
                title="At advised price"
                subtitle={formatUsd(advised)}
              />
              <ModeButton
                active={entryMode === "now"}
                onClick={() => setEntryMode("now")}
                title={side === "buy" ? "Buy now (market)" : "Sell now (market)"}
                subtitle={currentPrice ? formatUsd(currentPrice) : "market"}
              />
            </div>

            {side === "buy" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={attachLevels}
                  onChange={(e) => setAttachLevels(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Attach protocol stop ({formatUsd(levels.stopLoss)}) and TP1 ({formatUsd(levels.takeProfit1)})
              </label>
            ) : (
              <p className="text-xs text-muted">
                Short entries route as a plain sell order — Alpaca doesn&apos;t bracket short legs. Manage the
                stop ({formatUsd(levels.stopLoss)}) and TP1 ({formatUsd(levels.takeProfit1)}) manually.
              </p>
            )}
          </>
        ) : (
          <OptionsPicker
            status={chainStatus}
            error={chainError}
            onRetry={loadChain}
            chain={chain}
            optionType={optionType}
            setOptionType={changeOptionType}
            expiration={expiration}
            setExpiration={changeExpiration}
            rows={optionRows}
            contractSymbol={contractSymbol}
            setContractSymbol={setContractSymbol}
          />
        )}

        <div className="flex items-center gap-3">
          <label className="text-sm text-muted" htmlFor="qty">
            {assetType === "options" ? "Contracts" : "Quantity"}
          </label>
          <Input
            id="qty"
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-28"
          />
        </div>

        <Button variant={side === "buy" ? "bull" : "bear"} onClick={submit} disabled={disabled}>
          {submitting ? "Placing…" : actionLabel}
        </Button>

        {feedback && (
          <div className={cn("text-sm", feedback.ok ? "text-bull" : "text-bear")}>
            <p>{feedback.text}</p>
            {feedback.code === "short_not_allowed" && assetType === "shares" && (
              <button
                onClick={() => {
                  setSide("buy");
                  changeOptionType("put");
                  setFeedback(null);
                  openOptions();
                }}
                className="mt-1 underline underline-offset-2 cursor-pointer"
              >
                Buy a PUT instead →
              </button>
            )}
          </div>
        )}
        <p className="text-xs text-muted">
          Orders route to your paper account. Connect a live brokerage in Settings to trade real funds.
        </p>
      </CardContent>
    </Card>
  );
}

function OptionsPicker({
  status, error, onRetry, chain, optionType, setOptionType, expiration, setExpiration, rows, contractSymbol, setContractSymbol,
}: {
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  onRetry: () => void;
  chain: OptionChain | null;
  optionType: OptionType;
  setOptionType: (t: OptionType) => void;
  expiration: string;
  setExpiration: (e: string) => void;
  rows: StrikeRow[];
  contractSymbol: string;
  setContractSymbol: (s: string) => void;
}) {
  if (status === "loading" || status === "idle") {
    return <p className="text-sm text-muted">Loading options chain…</p>;
  }
  if (status === "error") {
    return (
      <div className="text-sm text-bear">
        <p>{error}</p>
        <button onClick={onRetry} className="mt-1 underline underline-offset-2 cursor-pointer">
          Retry
        </button>
      </div>
    );
  }
  if (!chain || chain.expirations.length === 0) {
    return <p className="text-sm text-muted">No listed options for this symbol.</p>;
  }

  const ref = chain.price;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <SideButton active={optionType === "call"} tone="bull" onClick={() => setOptionType("call")} title="Call" />
        <SideButton active={optionType === "put"} tone="bear" onClick={() => setOptionType("put")} title="Put" />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Expiration</span>
        <select
          value={expiration}
          onChange={(e) => setExpiration(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {chain.expirations.map((e) => (
            <option key={e.expiration} value={e.expiration}>
              {e.expiration}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Strike {ref ? `(spot ${formatUsd(ref)})` : ""}</span>
        <select
          value={contractSymbol}
          onChange={(e) => setContractSymbol(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
        >
          {rows.length === 0 && <option value="">No strikes</option>}
          {rows.map((r) => {
            const sym = (optionType === "call" ? r.call : r.put)!;
            const atm = ref ? Math.abs(r.strike - ref) < 1 : false;
            return (
              <option key={sym} value={sym}>
                {formatUsd(r.strike)}
                {atm ? "  · ATM" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {contractSymbol && <p className="font-mono text-xs text-muted">Contract: {contractSymbol}</p>}
      <p className="text-xs text-muted">
        Options route as market orders to the paper account. Requires an options-enabled Alpaca account.
      </p>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
        active ? "border-accent bg-accent-soft text-accent" : "border-border text-muted hover:border-muted",
      )}
    >
      {label}
    </button>
  );
}

function SideButton({
  active, tone, onClick, title, hint,
}: { active: boolean; tone: "bull" | "bear"; onClick: () => void; title: string; hint?: string }) {
  const activeCls = tone === "bull" ? "border-bull bg-bull/10 text-bull" : "border-bear bg-bear/10 text-bear";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? activeCls : "border-border text-muted hover:border-muted",
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs opacity-70">{hint}</p>}
    </button>
  );
}

function ModeButton({
  active, onClick, title, subtitle,
}: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? "border-accent bg-accent-soft" : "border-border hover:border-muted",
      )}
    >
      <p className={cn("text-sm font-medium", active && "text-accent")}>{title}</p>
      <p className="font-mono text-xs text-muted">{subtitle}</p>
    </button>
  );
}
