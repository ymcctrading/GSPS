"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlossaryTerm } from "@/components/glossary-term";
import { checkBracket } from "@/lib/trade/bracket";
import { planProtocolExit } from "@/lib/trade/protocol-exit";
import { PATTERN_GLOSSARY_TERM } from "@/lib/education/patterns";
import {
  ROUNDING_MODE_LABELS,
  conservativeMode,
  validateLimitPrice,
  type RoundingMode,
} from "@/lib/trade/tick-size";
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
  intradaySourced = false,
  forceSide,
}: {
  result: ScanResult;
  livePrice?: number | null;
  /**
   * True when this ticket was opened from the intraday alerts panel's
   * "Trade this" action rather than a signal card or manual entry. Tags the
   * submitted order so lib/trade/place-order.ts applies the intraday
   * tier-promotion gates (lib/promotion/pro-intraday.ts) to it.
   */
  intradaySourced?: boolean;
  /** Preselects the side from the alert's direction; the user can still change it. */
  forceSide?: Side;
}) {
  const { levels, pattern, symbol } = result;
  const currentPrice = livePrice ?? (result.currentPrice > 0 ? result.currentPrice : null);

  const hasProtocolSignal = !!(levels && pattern);
  const signalSide: Side = forceSide ?? (pattern?.direction === "bearish" ? "sell" : "buy");

  const [assetType, setAssetType] = useState<AssetType>("shares");
  const [side, setSide] = useState<Side>(signalSide);
  const [qty, setQty] = useState("1");
  const [entryMode, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [manualStop, setManualStop] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  /**
   * Null means "use the conservative default for this side" — a buy rounds
   * down so the user never pays more than they asked, a sell rounds up so they
   * never receive less. An explicit choice overrides it.
   */
  const [rounding, setRounding] = useState<RoundingMode | null>(null);
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
  // Held against the symbol it describes, so a symbol change can never leave
  // the previous name's answer gating the short button for a render — which is
  // the rejection this pre-flight exists to avoid.
  const [tradabilityState, setTradability] = useState<{
    symbol: string;
    value: AssetTradability | null;
  }>({ symbol: "", value: null });
  const tradability = tradabilityState.symbol === symbol ? tradabilityState.value : null;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assets?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: AssetTradability | null) => !cancelled && d && setTradability({ symbol, value: d }))
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

  /**
   * Load the chain and select its at-the-money contract.
   *
   * `wanted` exists because the call/put state is not readable here when it
   * matters. "Buy a PUT instead" sets the option type and opens the tab in one
   * handler, and this callback closes over the value from the render that
   * created it — still `call`. The chain would then load and select an ATM
   * *call* while the UI showed Put selected, and the order would buy the call.
   * Passing the type explicitly removes the dependency on state that hasn't
   * committed yet.
   *
   * The argument is validated rather than defaulted, because this is also wired
   * straight to the Retry button's `onClick`, which would otherwise pass a
   * MouseEvent as the option type.
   */
  const loadChain = useCallback(
    async (wanted?: OptionType) => {
      const type: OptionType = wanted === "call" || wanted === "put" ? wanted : optionType;
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
        setContractSymbol(pickAtm(c, first, type));
        setChainStatus("ready");
      } catch (err) {
        setChainError(err instanceof Error ? err.message : String(err));
        setChainStatus("error");
      }
    },
    [symbol, currentPrice, optionType, pickAtm],
  );

  // Switching to the Options tab lazily loads the chain once.
  const openOptions = (wanted?: OptionType) => {
    setAssetType("options");
    if (chainStatus === "idle") loadChain(wanted);
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
    useProtocolLevels && levels && assetType === "shares"
      ? checkBracket({
          side,
          basePrice,
          stopLoss: levels.stopLoss,
          takeProfit: levels.takeProfit1,
        })
      : { ok: true as const };
  const bracketBlocked = !bracketCheck.ok;
  // A bracket that can't attach is silently dropped from the payload rather
  // than sent and rejected; the note under the checkbox says so.
  const attachingLevels = attachLevels && !bracketBlocked;

  // How the position will be exited, computed from the same function the server
  // runs. Shown before the button is pressed, because "60% out at TP1" changes
  // what the order *is* — a user who reads "attach protocol levels" and expects
  // an all-or-nothing bracket has been told the wrong thing.
  const exitPlan =
    useProtocolLevels && levels && assetType === "shares" && Number(qty) >= 1
      ? planProtocolExit(Number(qty), {
          stopLoss: levels.stopLoss,
          takeProfit1: levels.takeProfit1,
          masterProfit: levels.masterProfit,
        })
      : null;

  // Manual Override carries no armed signal to source levels from, so a stop
  // and target here are whatever the user types — optional, but once both are
  // filled in they're validated and staged the same way a protocol bracket is
  // (see lib/trade/exit-manager-sim.ts), so "every trade has a stop" holds in
  // this mode too, on both sides.
  const manualStopNum = Number(manualStop);
  const manualTargetNum = Number(manualTarget);
  // Guarded by assetType: the fields only render on the Shares tab, but the
  // state persists across a tab switch, so a value left over from Shares must
  // not block submitting an Options order that never showed these fields.
  const manualLevelsEntered =
    assetType === "shares" && (manualStop.trim() !== "" || manualTarget.trim() !== "");
  const manualLevelsComplete =
    assetType === "shares" &&
    manualStop.trim() !== "" &&
    manualTarget.trim() !== "" &&
    Number.isFinite(manualStopNum) &&
    manualStopNum > 0 &&
    Number.isFinite(manualTargetNum) &&
    manualTargetNum > 0;
  const manualBracketCheck =
    manualLevelsComplete && assetType === "shares"
      ? checkBracket({ side, basePrice, stopLoss: manualStopNum, takeProfit: manualTargetNum })
      : { ok: true as const };
  const manualLevelsBlocked = manualLevelsComplete && !manualBracketCheck.ok;
  const attachingManualLevels =
    executionMode === "manual" && assetType === "shares" && manualLevelsComplete && !manualLevelsBlocked;
  const manualExitPlan =
    attachingManualLevels && Number(qty) >= 1
      ? planProtocolExit(Number(qty), {
          stopLoss: manualStopNum,
          takeProfit1: manualTargetNum,
          masterProfit: null,
        })
      : null;

  // A limit price between two valid increments is refused by the broker
  // (`Invalid limit_price 49.755. sub-penny increment...`). The same check the
  // server runs before routing runs here too, so the corrected price is on
  // screen before the button is pressed rather than in a rejection after it.
  const limitPrice = assetType === "shares" && entryMode === "advised" ? advised : null;
  const effectiveRounding = rounding ?? conservativeMode(side);
  const priceCheck =
    limitPrice != null && limitPrice > 0
      ? validateLimitPrice({
          price: limitPrice,
          side,
          instrument: { assetType: "EQUITY" },
          mode: effectiveRounding,
        })
      : null;
  const priceBlocked = priceCheck != null && !priceCheck.ok;
  const submittedPrice = priceCheck?.price ?? limitPrice;

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
              intradaySourced,
            }
          : {
              symbol,
              assetClass: "equity" as const,
              side,
              qty: Number(qty),
              entryMode,
              limitPrice: entryMode === "advised" ? advised : undefined,
              // The server re-validates and re-rounds; sending the mode keeps
              // its answer identical to the one shown above the button.
              rounding: effectiveRounding,
              // Lets the server validate a market entry's bracket, which has no
              // limit price of its own to measure the legs against.
              referencePrice: currentPrice ?? undefined,
              // A staged exit attaches from the protocol's levels, or — in
              // Manual Override — from whatever stop/target the user typed in.
              // Both sides: this is our own simulated exit management, not a
              // real broker bracket, so it isn't limited to long entries.
              attachLevels: useProtocolLevels
                ? attachingLevels
                  ? { stopLoss: levels!.stopLoss, takeProfit: levels!.takeProfit1, masterProfit: levels!.masterProfit }
                  : undefined
                : attachingManualLevels
                  ? { stopLoss: manualStopNum, takeProfit: manualTargetNum }
                  : undefined,
              mode: "paper" as const,
              executionMode,
              intradaySourced,
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
      const placed = `Paper order placed — ${data.order?.status ?? "accepted"}.`;
      // The exit plan is part of what was just agreed to, so it is echoed back
      // from the server's own answer rather than from what the ticket predicted.
      const plan = data.exitPlan?.summary ? ` ${data.exitPlan.summary}` : "";
      setFeedback({ ok: !data.warning, text: `${placed}${plan}${data.warning ? ` ${data.warning}` : ""}` });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  /** Jump straight from a blocked short to the equivalent put ticket. */
  const switchToPut = useCallback(() => {
    setSide("buy");
    changeOptionType("put");
    setFeedback(null);
    // Explicit, not inferred from state: `setOptionType` above has not
    // committed yet, so anything reading the option type here still sees the
    // old value. Without this the chain loads an at-the-money call.
    openOptions("put");
  }, [changeOptionType, openOptions]);

  const optionRows = activeExpiry?.strikes.filter((r) => (optionType === "call" ? r.call : r.put)) ?? [];
  const canSubmitOptions = assetType === "options" && !!contractSymbol;
  const disabled =
    submitting ||
    Number(qty) < 1 ||
    (assetType === "options" && !canSubmitOptions) ||
    (shortBlocked && side === "sell") ||
    priceBlocked ||
    (executionMode === "manual" && manualLevelsEntered && (!manualLevelsComplete || manualLevelsBlocked));

  const actionLabel = (() => {
    if (assetType === "options") return `${side === "buy" ? "Buy" : "Sell"} to open ${optionType.toUpperCase()}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell short ${symbol}`;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order ticket · paper</CardTitle>
        {intradaySourced && (
          <p className="text-xs font-medium text-warn">
            Intraday-sourced — subject to the intraday entry/day, concurrent-position,
            consecutive-loss, and daily-loss-lock gates.
          </p>
        )}
        <CardDescription>
          {useProtocolLevels
            ? assetType === "options"
              ? `Trade ${symbol} options — protocol read is ${pattern!.direction}.`
              : `${side === "buy" ? "Long" : "Short"} ${symbol} — armed ${PATTERN_GLOSSARY_TERM[pattern!.name].toLowerCase()} setup is ${pattern!.direction}.`
            : `Manual ${side === "buy" ? "long" : "short"} execution for ${symbol} ${assetType === "options" ? "options" : ""} — no protocol levels attached${assetType === "shares" ? "; optional custom stop/target below" : ""}.`}
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
              be rejected. Trade the sell read with a put instead.
            </p>
            <button onClick={switchToPut} className="mt-2 min-h-9 cursor-pointer font-medium underline underline-offset-2">
              Buy a PUT instead →
            </button>
          </div>
        )}

        {assetType === "shares" ? (
          <>
            <div id="tour-entry" className="grid grid-cols-2 gap-2">
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
              <div id="tour-exit" className="flex flex-col gap-2">
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
                    Exit this trade on the protocol&apos;s levels — stop{" "}
                    {formatUsd(levels.stopLoss)}, TP1 {formatUsd(levels.takeProfit1)}
                    {levels.masterProfit ? `, master ${formatUsd(levels.masterProfit)}` : ""}
                    {side === "sell" &&
                      " GSPS stages and manages this exit itself — it isn't a native broker bracket, so it only advances while the app can poll (see Portfolio)."}
                  </span>
                </label>

                {attachingLevels && exitPlan && (
                  <ExitPlanNotice
                    summary={exitPlan.summary}
                    splittable={exitPlan.splittable}
                    hasMaster={levels.masterProfit != null}
                  />
                )}
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
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">
                  Optional — set a stop and target and GSPS stages the exit itself, the same way it
                  does for a protocol-recommended trade. Leave both blank for a plain order with no
                  managed exit.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Stop-loss
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualStop}
                      onChange={(e) => setManualStop(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Take-profit
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualTarget}
                      onChange={(e) => setManualTarget(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                {manualLevelsBlocked && (
                  <p className="text-xs text-warn">{manualBracketCheck.reason}</p>
                )}
                {attachingManualLevels && manualExitPlan && (
                  <ExitPlanNotice
                    summary={manualExitPlan.summary}
                    splittable={manualExitPlan.splittable}
                    hasMaster={false}
                  />
                )}
                {!manualLevelsEntered && (
                  <p className="text-xs text-muted">
                    No stop or target attached — this order carries no managed exit.
                  </p>
                )}
              </div>
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
          {useProtocolLevels && side === "buy" && assetType === "shares" && Number(qty) === 1 && (
            <span className="text-xs text-warn">Buy 2+ to use the full staged-exit plan.</span>
          )}
        </div>

        {priceCheck && (
          <PriceIncrementNotice
            check={priceCheck}
            mode={effectiveRounding}
            onModeChange={setRounding}
          />
        )}

        <Button
          variant={side === "buy" ? "bull" : "bear"}
          size="lg"
          onClick={submit}
          disabled={disabled}
          className="w-full"
        >
          {submitting
            ? "Placing…"
            : priceCheck?.adjusted && submittedPrice != null
              ? `${actionLabel} at ${formatUsd(submittedPrice)}`
              : actionLabel}
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
        <p id="tour-review" className="text-xs text-muted">
          Orders route to your{" "}
          <GlossaryTerm term="Paper trading" label="paper account" className="decoration-muted" />. Connect a
          live brokerage in Settings to trade real funds.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * What the protocol will do on the way out.
 *
 * This sits under the checkbox because "attach protocol levels" no longer means
 * one bracket that exits the whole position. It means a staged exit — most of
 * the position at TP1, part of the rest at the master target, a runner behind a
 * stop that ratchets to break-even and then trails. A user who presses the
 * button expecting all-or-nothing has been misled by the old wording, so the
 * real behaviour is spelled out in the real quantities before they commit.
 */
function ExitPlanNotice({
  summary,
  splittable,
  hasMaster,
}: {
  summary: string;
  splittable: boolean;
  hasMaster: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-xs",
        splittable ? "border-border bg-surface text-muted" : "border-warn/40 bg-warn-soft text-warn",
      )}
    >
      <p className="font-medium">On the way out</p>
      <p className="mt-1">{summary}</p>
      {splittable && (
        <p className="mt-1">
          Once TP1 is reached the stop moves to your entry and then trails the best price seen, so
          the trade can&apos;t come back as a loss.
          {hasMaster
            ? " If price pushes through the final target and falls back through it, the rest is closed."
            : ""}{" "}
          The trailing part advances while the app is open; the stop resting at the broker is what
          protects the position the rest of the time.
        </p>
      )}
    </div>
  );
}

/**
 * What the order will actually be priced at, and why it differs from the
 * advised price.
 *
 * This sits above the submit button rather than in an error toast afterwards
 * because the correction changes the trade: rounding a buy down by a cent is a
 * cent the user will not pay, and also a cent of fill probability they give up.
 * Both halves are stated, and the button label repeats the corrected price so
 * there is no way to press it without having seen the number.
 */
function PriceIncrementNotice({
  check,
  mode,
  onModeChange,
}: {
  check: ReturnType<typeof validateLimitPrice>;
  mode: RoundingMode;
  onModeChange: (m: RoundingMode) => void;
}) {
  if (!check.ok) {
    return (
      <div className="rounded-lg border border-bear/40 bg-bear-soft p-3 text-xs text-bear">
        <p className="font-medium">This price can&apos;t be used.</p>
        <p className="mt-1">{check.blockedReason}</p>
      </div>
    );
  }

  if (!check.adjusted) return null;

  return (
    <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
      <p className="font-medium">
        Price adjusted to {formatUsd(check.price!)} — the broker won&apos;t accept{" "}
        {formatUsd(check.requested, 4)}.
      </p>
      <p className="mt-1">{check.tick?.rule}</p>
      {check.fillProbabilityNote && <p className="mt-1">{check.fillProbabilityNote}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-medium">Rounding:</span>
        {(["down", "nearest", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            aria-pressed={mode === m}
            className={cn(
              "min-h-9 cursor-pointer rounded px-2 py-1 font-medium transition-colors",
              mode === m ? "bg-warn text-surface" : "border border-warn/40 hover:bg-warn/10",
            )}
          >
            {ROUNDING_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
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
