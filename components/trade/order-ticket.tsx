"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkBracket } from "@/lib/trade/bracket";
import { formatUsd, cn } from "@/lib/utils";
import type { ScanResult } from "@/lib/types";
import type { AssetTradability } from "@/app/api/assets/route";

type EntryMode = "advised" | "now";
type AssetType = "shares" | "options";
type Side = "buy" | "sell";
type OptionType = "call" | "put";
type ExecutionMode = "protocol" | "manual";

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

  const hasProtocolSignal = !!(levels && pattern);
  const signalSide: Side = pattern?.direction === "bearish" ? "sell" : "buy";

  const [assetType, setAssetType] = useState<AssetType>("shares");
  const [side, setSide] = useState<Side>(signalSide);
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(hasProtocolSignal ? "protocol" : "manual");

  // Options chain state.
  const [optionType, setOptionType] = useState<OptionType>(signalSide === "sell" ? "put" : "call");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [chainStatus, setChainStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [chainError, setChainError] = useState("");
  const [expiration, setExpiration] = useState("");
  const [contractSymbol, setContractSymbol] = useState("");

  // Tradability pre-flight: knowing up front that a name can't be shorted lets
  // the ticket steer toward a put instead of letting the broker reject the
  // order after the fact.
  const [tradability, setTradability] = useState<AssetTradability | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTradability(null);
    fetch(`/api/assets?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AssetTradability | null) => !cancelled && d && setTradability(d))
      .catch(() => {
        /* unknown tradability — the ticket stays permissive */
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const advised = levels?.entry ?? currentPrice ?? 0;

  // Only a definitive `false` blocks the short side; a lookup that didn't
  // resolve leaves the button enabled and defers to the broker.
  const shortBlocked = assetType === "shares" && tradability?.shortable === false;

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
  const useProtocolLevels = executionMode === "protocol" && hasProtocolSignal;

  // The price Alpaca measures the bracket legs against: the limit on an advised
  // entry, the live quote on a market entry. Choosing "buy now" below the
  // advised entry is what puts the protocol stop on the wrong side of the fill.
  const basePrice = entryMode === "advised" ? advised : currentPrice ?? 0;
  const bracketCheck =
    useProtocolLevels && levels && side === "buy" && assetType === "shares"
      ? checkBracket({
          side: "buy",
          basePrice,
          stopLoss: levels.stopLoss,
          takeProfit: levels.takeProfit1,
        })
      : { ok: true as const };
  const bracketBlocked = !bracketCheck.ok;
  // A bracket that can't attach is silently dropped from the payload rather
  // than sent and rejected; the note under the checkbox says so.
  const attachingLevels = attachLevels && !bracketBlocked;

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
              // Lets the server validate a market entry's bracket, which has no
              // limit price of its own to measure the legs against.
              referencePrice: currentPrice ?? undefined,
              // Brackets only attach to long entries, only with protocol levels,
              // and only when the legs sit on the side the broker requires.
              attachLevels:
                useProtocolLevels && attachingLevels && side === "buy"
                  ? { stopLoss: levels!.stopLoss, takeProfit: levels!.takeProfit1, masterProfit: levels!.masterProfit }
                  : undefined,
              mode: "paper" as const,
              executionMode,
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

  /** Jump straight from a blocked short to the equivalent put ticket. */
  const switchToPut = () => {
    setSide("buy");
    changeOptionType("put");
    setFeedback(null);
    openOptions();
  };

  const optionRows = activeExpiry?.strikes.filter((r) => (optionType === "call" ? r.call : r.put)) ?? [];
  const canSubmitOptions = assetType === "options" && !!contractSymbol;
  const disabled =
    submitting ||
    Number(qty) < 1 ||
    (assetType === "options" && !canSubmitOptions) ||
    (shortBlocked && side === "sell");

  const actionLabel = (() => {
    if (assetType === "options") return `Buy to ${side === "buy" ? "open" : "close"} ${optionType.toUpperCase()}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell short ${symbol}`;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order ticket · paper</CardTitle>
        <CardDescription>
          {useProtocolLevels
            ? assetType === "options"
              ? `Trade ${symbol} options — protocol read is ${pattern!.direction}.`
              : `${side === "buy" ? "Long" : "Short"} ${symbol} — armed ${pattern!.name} setup is ${pattern!.direction}.`
            : `Manual ${side === "buy" ? "long" : "short"} execution for ${symbol} ${assetType === "options" ? "options" : ""} — no protocol levels attached.`}
        </CardDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs font-semibold text-muted">Mode:</span>
          <button
            onClick={() => setExecutionMode("protocol")}
            disabled={!hasProtocolSignal}
            className={cn(
              "min-h-9 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
              executionMode === "protocol" && hasProtocolSignal
                ? "bg-accent text-surface"
                : "border border-border text-muted",
              !hasProtocolSignal && "opacity-50 cursor-not-allowed",
            )}
            title={hasProtocolSignal ? "Use the protocol's recommended entry and levels" : "No armed protocol signal for this symbol"}
          >
            Protocol Recommended
          </button>
          <button
            onClick={() => setExecutionMode("manual")}
            className={cn(
              "min-h-9 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
              executionMode === "manual" ? "bg-warn text-surface" : "border border-border text-muted hover:border-warn",
            )}
            title="Place an order independent of any protocol signal"
          >
            Manual Override
          </button>
        </div>
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
            hint={
              shortBlocked ? "not shortable" : signalSide === "sell" ? "protocol side" : undefined
            }
            disabled={shortBlocked}
            titleAttr={
              shortBlocked
                ? `${symbol} shares aren't available to borrow, so this broker won't accept a short.`
                : undefined
            }
          />
        </div>

        {/* Caught before submit — the broker would reject this with a 422. */}
        {shortBlocked && side === "sell" && (
          <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
            <p className="font-medium">{symbol} can&apos;t be sold short.</p>
            <p className="mt-1">
              Its shares aren&apos;t available to borrow through this broker, so a short order would
              be rejected. Trade the bearish read with a put instead.
            </p>
            <button onClick={switchToPut} className="mt-2 min-h-9 cursor-pointer font-medium underline underline-offset-2">
              Buy a PUT instead →
            </button>
          </div>
        )}

        {assetType === "shares" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <ModeButton
                active={entryMode === "advised"}
                onClick={() => setEntryMode("advised")}
                title={useProtocolLevels ? "At advised price" : "At reference price"}
                subtitle={formatUsd(advised)}
              />
              <ModeButton
                active={entryMode === "now"}
                onClick={() => setEntryMode("now")}
                title={side === "buy" ? "Buy now (market)" : "Sell now (market)"}
                subtitle={currentPrice ? formatUsd(currentPrice) : "market"}
              />
            </div>

            {useProtocolLevels && levels ? (
              side === "buy" ? (
                <div className="flex flex-col gap-2">
                  <label
                    className={cn(
                      "flex items-start gap-2 text-sm",
                      bracketBlocked && "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={attachingLevels}
                      disabled={bracketBlocked}
                      onChange={(e) => setAttachLevels(e.target.checked)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span>
                      Attach protocol stop ({formatUsd(levels.stopLoss)}) and TP1 (
                      {formatUsd(levels.takeProfit1)})
                    </span>
                  </label>
                  {bracketBlocked && (
                    <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
                      <p className="font-medium">Protocol levels can&apos;t attach to this entry.</p>
                      <p className="mt-1">{bracketCheck.reason}</p>
                      {entryMode === "now" && (
                        <button
                          onClick={() => setEntryMode("advised")}
                          className="mt-2 min-h-9 cursor-pointer font-medium underline underline-offset-2"
                        >
                          Use the advised entry ({formatUsd(advised)}) instead →
                        </button>
                      )}
                      <p className="mt-2 text-warn/80">
                        Placing it anyway routes a plain order — manage the stop yourself.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Short entries route as a plain sell order — Alpaca doesn&apos;t bracket short legs. Manage the
                  stop ({formatUsd(levels.stopLoss)}) and TP1 ({formatUsd(levels.takeProfit1)}) manually.
                </p>
              )
            ) : (
              <p className="text-xs text-muted">
                Manual order — no protocol stop or take-profit will be attached.
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
            inputMode="numeric"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-24 sm:w-28"
          />
        </div>

        <Button
          variant={side === "buy" ? "bull" : "bear"}
          size="lg"
          onClick={submit}
          disabled={disabled}
          className="w-full"
        >
          {submitting ? "Placing…" : actionLabel}
        </Button>

        {feedback && (
          <div
            className={cn(
              "rounded-lg border p-3 text-sm break-words",
              feedback.ok ? "border-bull/40 bg-bull-soft text-bull" : "border-bear/40 bg-bear-soft text-bear",
            )}
          >
            <p>{feedback.text}</p>
            {feedback.code === "short_not_allowed" && assetType === "shares" && (
              <button onClick={switchToPut} className="mt-2 min-h-9 underline underline-offset-2 cursor-pointer">
                Buy a PUT instead →
              </button>
            )}
            {feedback.code === "invalid_bracket" && entryMode === "now" && (
              <button
                onClick={() => {
                  setEntryMode("advised");
                  setFeedback(null);
                }}
                className="mt-2 min-h-9 underline underline-offset-2 cursor-pointer"
              >
                Switch to the advised entry ({formatUsd(advised)}) →
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
  active, tone, onClick, title, hint, disabled, titleAttr,
}: {
  active: boolean;
  tone: "bull" | "bear";
  onClick: () => void;
  title: string;
  hint?: string;
  disabled?: boolean;
  titleAttr?: string;
}) {
  const activeCls = tone === "bull" ? "border-bull bg-bull/10 text-bull" : "border-bear bg-bear/10 text-bear";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={titleAttr}
      className={cn(
        // min-h-12 keeps every tap target at/above the 44px mobile guideline.
        "min-h-12 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? activeCls : "border-border text-muted hover:border-muted",
        disabled && "cursor-not-allowed opacity-50 hover:border-border",
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
        "min-h-12 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? "border-accent bg-accent-soft" : "border-border hover:border-muted",
      )}
    >
      <p className={cn("text-sm font-medium", active && "text-accent")}>{title}</p>
      <p className="font-mono text-xs text-muted tabular-nums">{subtitle}</p>
    </button>
  );
}
