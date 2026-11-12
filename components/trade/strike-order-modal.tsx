"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd, cn } from "@/lib/utils";
import type { OptionContract } from "@/lib/data/provider";
import type { Moneyness } from "@/lib/options/contracts";
import { readPremiumStop } from "@/lib/trade/premium-stop";
import { OPTION_RISK_NOTE } from "@/lib/options/optionCopy";
import type { TradeLevels } from "@/lib/types";
import { useTerms } from "@/components/vocabulary";

export type OrderKind = "market" | "limit";
export type TradeAction = "buy" | "sell";

/** One US option contract controls 100 shares — the multiplier on every cost. */
const CONTRACT_MULTIPLIER = 100;

export interface StrikeSelection {
  contract: OptionContract;
  moneyness: Moneyness;
  underlying: string;
  underlyingPrice: number;
  /**
   * True when the chain behind this contract is modelled, not exchange data
   * (`OptionChain.simulated`). The ticket says so beside the IV, as the chain does.
   */
  simulated?: boolean;
}

/**
 * Purchase/sell ticket launched from a strike row in the options chain.
 *
 * Cost preview is computed from the side of the book the order would actually
 * cross — asks when buying, bids when selling — and a limit order previews at
 * the user's own price, so the number shown is the outlay being authorized.
 */
export function StrikeOrderModal({
  selection,
  levels,
  onClose,
}: {
  selection: StrikeSelection | null;
  /**
   * Protocol levels for the underlying. The structural stop distance, read
   * with the contract's delta, gives the information line below: what the
   * premium would lose if the underlying reached its stop. The premium paid is
   * still the stop and the risk (ref: SRC-001 Ch. 19A, R-006).
   */
  levels?: TradeLevels | null;
  onClose: () => void;
}) {
  const [action, setAction] = useState<TradeAction>("buy");
  const [orderKind, setOrderKind] = useState<OrderKind>("market");
  const [qty, setQty] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // The strike being traded, and its own reset-on-change. Retained (not
  // cleared to null with `selection`) so the ticket keeps showing the last
  // contract while the modal plays its exit transition, instead of the panel
  // going blank mid-animation.
  const [active, setActive] = useState<StrikeSelection | null>(selection);
  const [activeKey, setActiveKey] = useState(selectionKey(selection));
  const nextKey = selectionKey(selection);
  if (nextKey !== activeKey) {
    // A render-phase state adjustment (React's own recommended alternative to
    // an effect for "reset state when a prop changes") — no effect involved,
    // so this can't cascade into a second commit.
    setActiveKey(nextKey);
    if (selection) {
      setActive(selection);
      setAction("buy");
      setOrderKind("market");
      setQty("1");
      const mid = midPrice(selection.contract);
      setLimitPrice(mid != null ? String(mid) : "");
      setFeedback(null);
    }
  }

  const contract = active?.contract;
  // A contract belongs to one expiration: its own (the OCC symbol carries it).
  const expiration = contract?.expiration ?? "";
  const term = useTerms();

  const quantity = Number(qty);
  const limit = Number(limitPrice);

  const preview = useMemo(() => {
    if (!contract) return null;
    // Market orders cross the spread; limits fill at the user's price.
    const perShare =
      orderKind === "limit"
        ? limit
        : action === "buy"
          ? contract.ask
          : contract.bid;
    if (perShare == null || !Number.isFinite(perShare) || perShare <= 0) return null;
    if (!Number.isInteger(quantity) || quantity < 1) return null;

    const perContract = perShare * CONTRACT_MULTIPLIER;
    const total = perContract * quantity;
    return {
      perShare,
      perContract,
      total,
      // Max loss on a long option is the premium paid; a short is open-ended.
      maxLoss: action === "buy" ? total : null,
      breakeven:
        contract.type === "call"
          ? contract.strike + perShare
          : contract.strike - perShare,
    };
  }, [contract, orderKind, action, limit, quantity]);

  /**
   * How much of the premium the underlying's stop would consume, read exactly.
   * Information only (R-006): by Gann's rule the premium is the risk. Long
   * premium only: on a short the premium is collected and the loss is open.
   */
  const stopReading = useMemo(() => {
    if (!contract || !preview || !levels || action !== "buy" || contract.delta == null) return null;
    return readPremiumStop({
      risk: Math.abs(levels.entry - levels.stopLoss),
      premium: preview.perShare,
      delta: contract.delta,
      theta: contract.theta ?? 0,
    });
  }, [contract, preview, levels, action]);

  /**
   * A contract from a modelled chain is not orderable here. The simulated
   * chain (`simulateOptionChain`, used whenever the data provider has no
   * options feed) carries no broker contract symbol, and its bid, ask, IV and
   * greeks are generated, so neither the contract nor the cost shown is
   * real. Before 2026-11-09 the ticket fell back to the underlying's own
   * symbol and sent an equity order, so "Buy 1 CALL" asked for shares of the
   * underlying, with the modelled premium attached. Numbers audit, call 3
   * (/mnt/project-files/owner/app-numbers-audit.md). The order ticket's
   * Options tab lists the broker's real contracts and stays the way to
   * order an option.
   */
  const contractSymbol = contract?.contractSymbol;
  const notTradable = Boolean(active?.simulated) || !contractSymbol;

  const invalid =
    notTradable ||
    !contract ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    (orderKind === "limit" && (!Number.isFinite(limit) || limit <= 0)) ||
    !expiration;

  async function submit() {
    if (!active || !contract || notTradable || !contractSymbol) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: contractSymbol,
          assetClass: "option",
          side: action,
          qty: quantity,
          entryMode: orderKind === "limit" ? "advised" : "now",
          limitPrice: orderKind === "limit" ? limit : undefined,
          mode: "paper",
          optionDetail: {
            strike: contract.strike,
            type: contract.type,
            expiration,
            premium: preview?.perShare ?? null,
            contractCost: preview?.total ?? null,
            delta: contract.delta,
            gamma: contract.gamma,
            theta: contract.theta,
            vega: contract.vega,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ ok: false, text: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setFeedback({
        ok: true,
        text: `Paper order placed — ${data.order?.status ?? "accepted"}.`,
      });
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  const title = contract
    ? `${active?.underlying} ${formatUsd(contract.strike)} ${contract.type.toUpperCase()}`
    : "";

  return (
    <Modal
      open={Boolean(selection)}
      onClose={onClose}
      title={title}
      description={
        contract && active
          ? `Spot ${formatUsd(active.underlyingPrice)} · Exp ${contract.expiration} · ${term("impliedVol")} ${
              contract.iv != null ? `${(contract.iv * 100).toFixed(1)}%` : "—"
            }` +
            (active.simulated ? " · Simulated chain: IV, greeks and quotes are modelled, not exchange data" : "")
          : undefined
      }
      footer={
        contract && (
          <div className="flex flex-col gap-2">
            <Button
              variant={action === "buy" ? "bull" : "bear"}
              onClick={submit}
              disabled={invalid || submitting}
            >
              {notTradable
                ? "Ordering off: simulated chain"
                : submitting
                ? "Placing…"
                : `${action === "buy" ? "Buy" : "Sell"} ${quantity || 0} ${contract.type.toUpperCase()}${
                    quantity === 1 ? "" : "s"
                  }${preview ? ` · ${formatUsd(preview.total)}` : ""}`}
            </Button>
            {feedback && (
              <p className={cn("text-sm", feedback.ok ? "text-bull" : "text-bear")}>{feedback.text}</p>
            )}
            {notTradable ? (
              <p className="text-xs text-muted">
                Ordering is off here while this chain is simulated: its quotes are modelled, not
                exchange prices. To order an option, use the Options tab of the order ticket, which
                lists the broker&apos;s own contracts.
              </p>
            ) : (
              <p className="text-xs text-muted">
                Routes to your paper account. Connect a live brokerage in Settings to trade real funds.
              </p>
            )}
          </div>
        )
      }
    >
      {contract && active && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <MoneynessBadge moneyness={active.moneyness} />
            <Badge variant={contract.type === "call" ? "bull" : "bear"}>
              {contract.type.toUpperCase()}
            </Badge>
            <span className="text-xs text-muted">
              Bid <span className="font-mono text-foreground">{usdOrDash(contract.bid)}</span> · Ask{" "}
              <span className="font-mono text-foreground">{usdOrDash(contract.ask)}</span> · Last{" "}
              <span className="font-mono text-foreground">{usdOrDash(contract.last)}</span>
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-border p-3 text-xs sm:grid-cols-3">
            <Row label={term("delta")} value={greekOrDash(contract.delta, 2)} />
            <Row label={term("gamma")} value={greekOrDash(contract.gamma, 4)} />
            <Row label={term("theta")} value={greekOrDash(contract.theta, 2)} />
            <Row label={term("vega")} value={greekOrDash(contract.vega, 2)} />
            <Row label={term("openInterest")} value={contract.openInterest != null ? contract.openInterest.toLocaleString() : "—"} />
            <Row label="Volume" value={contract.volume != null ? contract.volume.toLocaleString() : "—"} />
          </dl>

          {/* Buy / Sell */}
          <Field label="Action">
            <div className="grid grid-cols-2 gap-2">
              <Toggle active={action === "buy"} tone="bull" onClick={() => setAction("buy")}>
                Buy to open
              </Toggle>
              <Toggle active={action === "sell"} tone="bear" onClick={() => setAction("sell")}>
                Sell to open
              </Toggle>
            </div>
          </Field>

          {/* Order type */}
          <Field label="Order type">
            <div className="grid grid-cols-2 gap-2">
              <Toggle active={orderKind === "market"} onClick={() => setOrderKind("market")}>
                <span className="block text-sm font-medium">Buy now (market)</span>
                <span className="block font-mono text-xs opacity-70">
                  {usdOrDash(action === "buy" ? contract.ask : contract.bid)}
                </span>
              </Toggle>
              <Toggle active={orderKind === "limit"} onClick={() => setOrderKind("limit")}>
                <span className="block text-sm font-medium">Limit order</span>
                <span className="block font-mono text-xs opacity-70">your price</span>
              </Toggle>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Quantity (contracts)">
              <Input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </Field>

            {orderKind === "limit" && (
              <Field label="Limit price (per share)">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                />
              </Field>
            )}
          </div>

          {/* Preview cost — recomputes on every input change. */}
          <div className="rounded-lg border border-border bg-background p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Preview cost
            </h4>
            {preview ? (
              <dl className="flex flex-col gap-1.5 text-sm">
                <Row label="Premium (per share)" value={formatUsd(preview.perShare)} />
                <Row
                  label={`Per contract (×${CONTRACT_MULTIPLIER})`}
                  value={formatUsd(preview.perContract)}
                />
                <Row label="Breakeven at expiry" value={formatUsd(preview.breakeven)} />
                <div className="my-1 border-t border-border" />
                <Row
                  label={`Estimated ${action === "buy" ? "outlay" : "credit"}`}
                  value={formatUsd(preview.total)}
                  strong
                />
                <Row
                  label="Max loss"
                  value={preview.maxLoss != null ? formatUsd(preview.maxLoss) : "Undefined (short)"}
                  tone={preview.maxLoss != null ? undefined : "bear"}
                />
                {stopReading && (
                  <Row
                    label={`Premium at risk (delta ${Math.abs(contract.delta ?? 0).toFixed(2)})`}
                    value={stopReading.capped ? "100% of premium (all of it)" : `${stopReading.pctOfPremium.toFixed(1)}% of premium`}
                  />
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted">
                {orderKind === "market" && (action === "buy" ? contract.ask : contract.bid) == null
                  ? `No ${action === "buy" ? "ask" : "bid"} is quoted for this contract; use a limit order at your own price.`
                  : "Enter a whole quantity and a valid price."}
              </p>
            )}
            {action === "buy" && (
              <p className="mt-2 text-xs text-muted">{OPTION_RISK_NOTE}</p>
            )}
            {stopReading && (
              <p className="mt-2 text-xs text-muted">
                A GSPS reading, not one of the method&apos;s rules: {formatUsd(stopReading.stopCost)} to the underlying&apos;s stop
                {stopReading.decayCost > 0 &&
                  ` + ${formatUsd(stopReading.decayCost)} decay`}{" "}
                per share.
                {stopReading.capped && " That is more than the premium, and a bought option can lose only what was paid for it."}
              </p>
            )}
            {orderKind === "market" && (
              <p className="mt-2 text-xs text-muted">
                Market orders cross the spread — the fill can differ from this estimate.
              </p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function midPrice(c: OptionContract): number | null {
  if (c.bid != null && c.ask != null) return Math.round(((c.bid + c.ask) / 2) * 100) / 100;
  return c.last;
}

function usdOrDash(v: number | null | undefined): string {
  return v != null ? formatUsd(v) : "—";
}

function greekOrDash(v: number | null | undefined, digits: number): string {
  return v != null ? v.toFixed(digits) : "—";
}

/** Identity for a strike selection — changes exactly when the ticket should reset. */
function selectionKey(s: StrikeSelection | null): string {
  return s ? `${s.underlying}|${s.contract.type}|${s.contract.strike}|${s.contract.expiration}` : "";
}

export function MoneynessBadge({ moneyness }: { moneyness: Moneyness }) {
  const variant = moneyness === "ITM" ? "bull" : moneyness === "ATM" ? "warn" : "muted";
  return <Badge variant={variant}>{moneyness}</Badge>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-muted">{label}</span>
        {hint && <span className="text-xs text-muted/80">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: "bull" | "bear";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "bull"
      ? "border-bull bg-bull/10 text-bull"
      : tone === "bear"
        ? "border-bear bg-bear/10 text-bear"
        : "border-accent bg-accent-soft text-accent";
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors cursor-pointer",
        active ? activeCls : "border-border text-muted hover:border-muted",
      )}
    >
      {children}
    </button>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "bear" | "bull" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          strong && "text-base font-semibold",
          tone === "bear" && "text-bear",
          tone === "bull" && "text-bull",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
