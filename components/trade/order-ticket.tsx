"use client";

import { RoundNumberNotice } from "@/components/gann/round-number-notice";
import { TRADE_STYLES } from "@/lib/trade/tradeStyle";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlossaryTerm } from "@/components/glossary-term";
import { checkBracket } from "@/lib/trade/bracket";
import { isInvalidatedByStop } from "@/lib/trade/invalidate-pending";
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
import type { StrategyModeId } from "@/lib/strategies/types";
import { planQuery } from "@/lib/strategies/explain/params";
import type { OwnTechniqueLevels, TechniqueRead } from "@/lib/strategies/compare";
import { EXECUTION_TIMEFRAME } from "@/lib/timeframe";
import type { IntradayChartPlan } from "@/lib/chart/planForTimeframe";

type EntryMode = "advised" | "now";
type AssetType = "shares" | "options";
type Side = "buy" | "sell";
type OptionType = "call" | "put";
/**
 * Which levels a manual trade uses (owner, 2026-10-28: "allow for an option to
 * trade the swing plan, the intraday plan, or use the users own sl, tp1, and
 * mtp levels"): the daily plan's, the intraday alert's for the session, or the
 * person's own stop, TP1 and MTP.
 */
type LevelChoice = "swing" | "intraday" | "own";

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
  intradayPlan = null,
  sessionPlan = null,
  forceSide,
  onExplainChange,
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
  /**
   * The intraday alert's own stop, first target and MTP (the Intraday style,
   * `lib/trade/tradeStyle.ts`), carried by its "Trade this" link. The ticket
   * opens on them as a market entry; the person can still edit the stop and
   * target. The MTP is recorded with the order and sells nothing. Null for
   * every other ticket.
   */
  intradayPlan?: { stop: number; target: number; master?: number | null } | null;
  /**
   * The intraday panel's current alert for this symbol, offered as a trade
   * (the plan the chart draws on an intraday timeframe,
   * `lib/chart/planForTimeframe.ts`). Lets a ticket not opened from the alert
   * still choose the intraday plan. Null or undefined when none stands, or
   * the plan has no intraday access.
   */
  sessionPlan?: IntradayChartPlan | null;
  /** Preselects the side from the alert's direction; the user can still change it. */
  forceSide?: Side;
  /**
   * Tells the page which technique or script is explaining the plan, so the
   * chart can switch its lines on (owner decision 2026-10-16: automatic).
   */
  onExplainChange?: (choice: {
    mode: StrategyModeId;
    scriptId: string | null;
  }) => void;
}) {
  const { pattern, symbol } = result;
  const levels = result.levels;
  const currentPrice = livePrice ?? (result.currentPrice > 0 ? result.currentPrice : null);

  // `levels`/`result.direction` are Gann's swing-crossing entry trigger
  // (lib/scanTicker.ts, lib/gann/entryTrigger.ts) — the trade plan's actual
  // entry, direction, stop, and targets since 2026-09-17. `pattern` is the
  // separate STRAT bar-sequence taxonomy, kept for display/confluence only
  // (AGENTS.md "Gann-grounded platform" audit outcomes) and can be null or
  // point the opposite way from a Gann-armed setup — it must never decide
  // whether a protocol signal exists (that's `levels`/`result.direction`
  // alone) or, when a direction is actually armed, which side it's on.
  // A recommended trade is an Execute verdict (owner report, 2026-10-16: a
  // low-scoring SPY plan read "Protocol Recommended"). A Watch or Reject plan
  // keeps its levels for reference, and an order on it is a Manual Override.
  const verdict = result.decision?.outputState;
  const hasProtocolSignal = !!(levels && result.direction !== "none" && verdict === "Execute");
  const belowExecute = !!(levels && result.direction !== "none" && verdict !== "Execute");
  // Reading `signalSide` off `pattern.direction` let the ticket highlight
  // "Buy/Long" for levels that were actually priced short (stop above entry,
  // targets below) -- internally contradictory, and read as invalidated
  // almost by construction since the buy-side stop check assumes the stop
  // sits below entry. `result.direction` is the one field that actually
  // agrees with `levels`; fall back to `pattern` only when there's no armed
  // direction at all (nothing to trade either way, so the fallback is
  // display-only and `hasProtocolSignal` above is already false).
  const signalSide: Side =
    forceSide ??
    (result.direction !== "none"
      ? result.direction === "bearish"
        ? "sell"
        : "buy"
      : pattern?.direction === "bearish"
        ? "sell"
        : "buy");

  const [assetType, setAssetType] = useState<AssetType>("shares");
  const [side, setSide] = useState<Side>(signalSide);
  const [qty, setQty] = useState("1");
  const [entryModeChoice, setEntryMode] = useState<EntryMode>("advised");
  const [attachLevels, setAttachLevels] = useState(true);
  const [manualStop, setManualStop] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [manualMaster, setManualMaster] = useState("");
  // Strategy Modes (AGENTS.md's "Strategy Modes" section; docs/STRATEGY_MODES.md).
  // Since 2026-10-22 (owner: "we can guide users to the water, but we can
  // NEVER force them to drink"): every technique the person may use is read
  // against GSPS's plan, the ones that align first. An aligned technique
  // trades GSPS's plan; any other offers its own entry, stop and TP1, never
  // an MTP, and the person may choose to trade it as a Manual Override
  // (lib/strategies/compare.ts). Nothing here touches `levels` or
  // `result.direction`.
  // `strategyMode` / `selectedScriptId` pick the technique drawn on the chart.
  const [strategyMode, setStrategyMode] = useState<StrategyModeId>("gann");
  // Server-resolved (`lib/entitlements/policy.ts#allowedStrategyModes`) —
  // null while loading, [] for a tier with no Strategy Mode access at all
  // (Novice). Never computed client-side.
  const [allowedStrategyModes, setAllowedStrategyModes] = useState<StrategyModeId[] | null>(null);
  // The person's own active scripts (`/api/strategy-plugins`, RLS- and
  // tier-scoped to the author); empty for no scripts or a tier without them.
  const [customScripts, setCustomScripts] = useState<
    { id: string; name: string; author: string; version: number; active: boolean }[] | null
  >(null);
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [techniques, setTechniques] = useState<TechniqueRead[] | null>(null);
  const [techniqueStatus, setTechniqueStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [techniqueError, setTechniqueError] = useState("");
  // A non-aligned technique's own levels the person chose to trade: its entry
  // becomes the Manual Override's limit, its stop and TP1 the manual exit.
  const [techniqueTrade, setTechniqueTrade] = useState<
    (OwnTechniqueLevels & { source: string; label: string }) | null
  >(null);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    onExplainChange?.({ mode: strategyMode, scriptId: selectedScriptId || null });
  }, [strategyMode, selectedScriptId, onExplainChange]);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; code?: string } | null>(null);
  /**
   * Null means "use the conservative default for this side" — a buy rounds
   * down so the user never pays more than they asked, a sell rounds up so they
   * never receive less. An explicit choice overrides it.
   */
  const [rounding, setRounding] = useState<RoundingMode | null>(null);
  const [levelChoice, setLevelChoice] = useState<LevelChoice>(hasProtocolSignal ? "swing" : "own");
  // Own levels managed on the session's rules (the Intraday style) rather than
  // as a swing: offered wherever an intraday plan could be chosen.
  const [manageIntraday, setManageIntraday] = useState(false);
  // The intraday plan is traded at the market, as its alert has fired.
  const entryMode: EntryMode = levelChoice === "intraday" ? "now" : entryModeChoice;

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

  // The intraday plan the ticket can trade: the alert the person clicked
  // "Trade this" on, else the panel's current alert for the symbol. Its side is
  // where its stop and first target sit.
  const intradayLevels: { stop: number; target: number; master: number | null } | null =
    intradayPlan
      ? { stop: intradayPlan.stop, target: intradayPlan.target, master: intradayPlan.master ?? null }
      : sessionPlan && sessionPlan.stop != null && sessionPlan.firstTarget != null &&
          sessionPlan.stop > 0 && sessionPlan.firstTarget > 0 && sessionPlan.stop !== sessionPlan.firstTarget
        ? { stop: sessionPlan.stop, target: sessionPlan.firstTarget, master: sessionPlan.masterTarget }
        : null;
  const intradaySide: Side | null = intradayLevels ? (intradayLevels.target > intradayLevels.stop ? "buy" : "sell") : null;
  const intradayAvailable = intradaySourced || intradayLevels != null;

  // An intraday alert's plan opens the ticket on its own levels, once per plan:
  // a market entry (the alert has fired) with the alert's stop, first target
  // and MTP. Derived during render, as the symbol reset below is.
  const [holdOvernight, setHoldOvernight] = useState(false);
  // With no plan in the link, the ticket still opens on the trader's own
  // levels, managed as an intraday trade.
  const intradayKey = intradaySourced ? `${symbol}|${intradayPlan ? `${intradayPlan.stop}|${intradayPlan.target}` : "own"}` : null;
  const [appliedIntraday, setAppliedIntraday] = useState<string | null>(null);
  if (intradayKey && appliedIntraday !== intradayKey) {
    setAppliedIntraday(intradayKey);
    setLevelChoice(intradayPlan ? "intraday" : "own");
    setManageIntraday(!intradayPlan);
    setAssetType("shares");
    setEntryMode("now");
    setHoldOvernight(false);
  }
  const intradayStyle = TRADE_STYLES.intraday;
  const isCrypto = symbol.includes("/");

  // Another symbol's techniques and levels never carry over, nor another
  // plan's: the symbol page keeps the ticket open when it reads the plan again
  // (components/scan/ticker-view.tsx), and a reading of the old levels would
  // describe a plan no longer on screen.
  const planSignature = `${symbol}|${levels ? `${levels.entry}|${levels.stopLoss}|${levels.takeProfit1}|${levels.masterProfit}` : "none"}`;
  const [techniquesFor, setTechniquesFor] = useState(planSignature);
  if (techniquesFor !== planSignature) {
    setTechniquesFor(planSignature);
    setTechniques(null);
    setTechniqueStatus("idle");
    setTechniqueTrade(null);
  }

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

  // Load the user's saved default Strategy Mode once (Settings ->
  // "Strategy mode"). It only picks the technique drawn on the chart; it
  // never fills the manual stop/target.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategy-mode-preference")
      .then((res) => res.json())
      .then((body: { mode?: StrategyModeId; allowedModes?: StrategyModeId[] }) => {
        if (cancelled) return;
        if (body.mode) setStrategyMode(body.mode);
        setAllowedStrategyModes(body.allowedModes ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllowedStrategyModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the signed-in user's own saved custom scripts, if any. Only decides
  // whether the techniques panel shows for a tier without built-in modes.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategy-plugins")
      .then((res) => (res.ok ? res.json() : { plugins: [] }))
      .then((body: { plugins?: typeof customScripts }) => {
        if (!cancelled) setCustomScripts((body.plugins ?? []).filter((p) => p.active));
      })
      .catch(() => {
        if (!cancelled) setCustomScripts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A technique's own entry is the reference limit only in Manual Override,
  // and only once the person chose to trade that technique's levels.
  // It lapses once the person changes the side, the stop or the target: the
  // order is then their own, priced from their own fields.
  const techniqueEntry =
    levelChoice === "own" &&
    techniqueTrade &&
    side === (techniqueTrade.direction === "bearish" ? "sell" : "buy") &&
    manualStop === priceField(techniqueTrade.stopLoss) &&
    manualTarget === priceField(techniqueTrade.takeProfit1) &&
    manualMaster.trim() === ""
      ? techniqueTrade
      : null;
  const advised = techniqueEntry?.entry ?? levels?.entry ?? currentPrice ?? 0;
  // GSPS's plan, sent to the techniques route so each technique is read
  // against these levels and ranked by whether it aligns with them.
  const explainPlan =
    hasProtocolSignal && levels && result.direction !== "none"
      ? {
          direction: result.direction,
          entry: levels.entry,
          stopLoss: levels.stopLoss,
          takeProfit1: levels.takeProfit1,
          masterTarget: levels.masterProfit,
        }
      : null;

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
  const useProtocolLevels = levelChoice === "swing" && hasProtocolSignal;
  // The trade is managed on the session's rules: the intraday plan, or own
  // levels the person asked to manage that way.
  const orderIntraday =
    levelChoice === "intraday" || (levelChoice === "own" && manageIntraday && intradayAvailable);

  // The setup's own invalidation rule, checked against the live quote rather
  // than the price it was scored at. A stop is the line the pattern's thesis
  // was staked on — once the market has traded through it, the advised entry
  // is a dead level dressed up as a live one, and letting the ticket route an
  // order at it (see the AVGO/IREN 9/8 incident) is the exact failure this
  // guards against. Read off signalSide (the protocol's own direction), not
  // the currently selected side, since the levels were computed for that
  // direction regardless of which button the user has toggled.
  //
  // A breached stop retires the plan (owner decision, 2026-09-30;
  // lib/gann/stopBreach.ts): it stands again only if a closed bar closes back
  // through the broken level by the allowance (the scan reads those bars), or a
  // new plan replaces it, so price climbing back to the old entry does not
  // quietly un-retire it. Two memories carry that here. The scan itself
  // (`result.stopBreach`: it ran with price already through the stop), and a
  // latch on the live quote (price broke the stop while this scan's plan was
  // on screen). The latch is keyed to the scan it was seen on, so a newer scan
  // clears it, and the new scan says for itself whether the plan stands.
  const liveBreach =
    useProtocolLevels && !!levels && currentPrice != null &&
    isInvalidatedByStop({ side: signalSide, stop_price: levels.stopLoss }, currentPrice);
  const [breachLatch, setBreachLatch] = useState<{ scannedAt: string; price: number } | null>(null);
  if (liveBreach && currentPrice != null && breachLatch?.scannedAt !== result.scannedAt) {
    setBreachLatch({ scannedAt: result.scannedAt, price: currentPrice });
  }
  const latchedBreachPrice = breachLatch?.scannedAt === result.scannedAt ? breachLatch.price : null;
  const breachPrice = liveBreach ? currentPrice : (latchedBreachPrice ?? result.stopBreach?.price ?? null);
  const protocolInvalidated = useProtocolLevels && !!levels && breachPrice != null;
  // The same retirement, read in either mode, for the technique panels: a
  // retired plan has no levels left for a technique to explain.
  const planRetired =
    !!levels &&
    (breachPrice != null ||
      (currentPrice != null &&
        isInvalidatedByStop({ side: signalSide, stop_price: levels.stopLoss }, currentPrice)));
  const explainable = planRetired ? null : explainPlan;

  // Every technique against the plan, aligned first (lib/strategies/compare.ts).
  // A retired plan sends no plan, so nothing aligns and each armed technique
  // offers its own levels.
  async function readTechniques() {
    setTechniqueStatus("loading");
    setTechniqueError("");
    try {
      const q = explainable ? `&${planQuery(explainable)}` : "";
      const res = await fetch(
        `/api/strategy-levels/compare?symbol=${encodeURIComponent(symbol)}&timeframe=${EXECUTION_TIMEFRAME}${q}`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't read the techniques.");
      setTechniques(body.techniques ?? []);
      setTechniqueStatus("ready");
    } catch (err) {
      setTechniqueError(err instanceof Error ? err.message : String(err));
      setTechniqueStatus("error");
    }
  }

  /** Draw a technique on the chart: a built-in mode, or `custom:<scriptId>`. */
  function showTechnique(source: string) {
    if (source.startsWith("custom:")) {
      setStrategyMode("gann");
      setSelectedScriptId(source.slice("custom:".length));
    } else {
      setSelectedScriptId("");
      setStrategyMode(source as StrategyModeId);
    }
  }

  /** The person chose a non-aligned technique's own levels: a Manual Override. */
  function tradeTechnique(t: TechniqueRead) {
    if (!t.ownLevels) return;
    const own = t.ownLevels;
    setTechniqueTrade({ ...own, source: t.source, label: t.label });
    setLevelChoice("own");
    setManualMaster("");
    setManageIntraday(false);
    setAssetType("shares");
    setSide(own.direction === "bearish" ? "sell" : "buy");
    setEntryMode("advised");
    setManualStop(priceField(own.stopLoss));
    setManualTarget(priceField(own.takeProfit1));
    showTechnique(t.source);
  }

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
  // runs. Shown before the button is pressed, because how it exits changes
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

  // The person's own levels carry no armed signal to source them from, so a
  // stop, TP1 and MTP here are whatever the user types. Once the stop and TP1
  // are filled in they're validated and staged the same way a protocol
  // bracket is (see lib/trade/exit-manager-sim.ts), so "every trade has a
  // stop" holds here too, on both sides. The MTP is optional and, when given,
  // has to lie beyond TP1.
  const manualStopNum = Number(manualStop);
  const manualTargetNum = Number(manualTarget);
  const manualMasterNum = Number(manualMaster);
  const manualMasterEntered = manualMaster.trim() !== "";
  // Guarded by assetType: the fields only render on the Shares tab, but the
  // state persists across a tab switch, so a value left over from Shares must
  // not block submitting an Options order that never showed these fields.
  const manualLevelsEntered =
    assetType === "shares" && (manualStop.trim() !== "" || manualTarget.trim() !== "" || manualMasterEntered);
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
      ? checkBracket({
          side,
          basePrice,
          stopLoss: manualStopNum,
          takeProfit: manualTargetNum,
          masterProfit: manualMasterEntered ? manualMasterNum : null,
        })
      : { ok: true as const };
  const manualLevelsBlocked = manualLevelsComplete && !manualBracketCheck.ok;
  const attachingManualLevels =
    levelChoice === "own" && assetType === "shares" && manualLevelsComplete && !manualLevelsBlocked;

  // The intraday plan's levels, checked against the market entry they go with.
  // Its MTP rides with the order while it lies beyond the first target on the
  // trade's side (the person may have flipped the side).
  const intradayMaster =
    intradayLevels?.master != null &&
    (side === "buy" ? intradayLevels.master > intradayLevels.target : intradayLevels.master < intradayLevels.target)
      ? intradayLevels.master
      : null;
  const intradayBracketCheck =
    levelChoice === "intraday" && intradayLevels && assetType === "shares"
      ? checkBracket({ side, basePrice, stopLoss: intradayLevels.stop, takeProfit: intradayLevels.target })
      : { ok: true as const };
  const attachingIntradayLevels =
    levelChoice === "intraday" && assetType === "shares" && !!intradayLevels && intradayBracketCheck.ok;

  // The exit the order carries when it isn't the swing plan's.
  const chosenExit: { stopLoss: number; takeProfit: number; masterProfit: number | null } | null =
    attachingIntradayLevels && intradayLevels
      ? { stopLoss: intradayLevels.stop, takeProfit: intradayLevels.target, masterProfit: intradayMaster }
      : attachingManualLevels
        ? { stopLoss: manualStopNum, takeProfit: manualTargetNum, masterProfit: manualMasterEntered ? manualMasterNum : null }
        : null;
  const manualExitPlan =
    chosenExit && Number(qty) >= 1
      ? planProtocolExit(Number(qty), {
          stopLoss: chosenExit.stopLoss,
          takeProfit1: chosenExit.takeProfit,
          masterProfit: chosenExit.masterProfit,
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
              intradaySourced: orderIntraday,
            }
          : {
              symbol,
              assetClass: "equity" as const,
              side,
              qty: Number(qty),
              entryMode,
              limitPrice: entryMode === "advised" ? advised : undefined,
              // The protocol's stop, so the server reads Gann's crossing line
              // (never on a technique's own entry, which is the person's own limit)
              // from the protocol's entry and stop even when no levels are
              // attached or a Manual Override stop was typed. Only on the
              // plan's own side: against it, the stop is on the wrong side
              // and the order is the person's own limit.
              entryStop:
                !techniqueEntry && entryMode === "advised" && levels && hasProtocolSignal && side === (result.direction === "bearish" ? "sell" : "buy")
                  ? levels.stopLoss
                  : undefined,
              entryKind:
                !techniqueEntry && entryMode === "advised" && levels?.entryKind && hasProtocolSignal && side === (result.direction === "bearish" ? "sell" : "buy")
                  ? levels.entryKind
                  : undefined,
              // A technique's own levels the person chose: their own limit,
              // with no crossing line to wait for (lib/strategies/compare.ts).
              techniqueSource: techniqueEntry?.source,
              // The protocol's first target, for the failed-top check; a
              // Manual Override target doesn't replace it.
              entryTarget:
                !techniqueEntry && entryMode === "advised" && levels && hasProtocolSignal && side === (result.direction === "bearish" ? "sell" : "buy")
                  ? levels.takeProfit1
                  : undefined,
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
                : chosenExit
                  ? {
                      stopLoss: chosenExit.stopLoss,
                      takeProfit: chosenExit.takeProfit,
                      ...(chosenExit.masterProfit != null ? { masterProfit: chosenExit.masterProfit } : {}),
                    }
                  : undefined,
              mode: "paper" as const,
              executionMode: useProtocolLevels ? "protocol" : "manual",
              // Managed on the session's rules (lib/trade/exit-style.ts) and
              // subject to the intraday entry gates: the intraday plan, or own
              // levels the person asked to manage that way.
              intradaySourced: orderIntraday,
              // The Intraday style's session close is the default; this is the way out of it.
              holdOvernight: orderIntraday ? holdOvernight || isCrypto : undefined,
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
    protocolInvalidated ||
    (levelChoice === "swing" && !hasProtocolSignal) ||
    (levelChoice === "own" && manualLevelsEntered && (!manualLevelsComplete || manualLevelsBlocked)) ||
    // An intraday trade is placed with its stop and first target (the server refuses it otherwise).
    (orderIntraday && !chosenExit);

  const actionLabel = (() => {
    if (assetType === "options") return `${side === "buy" ? "Buy" : "Sell"} to open ${optionType.toUpperCase()}`;
    return side === "buy" ? `Buy ${symbol}` : `Sell short ${symbol}`;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order ticket · paper</CardTitle>
        {orderIntraday && (
          <p className="text-xs font-medium text-warn">
            Intraday trade: subject to the intraday concurrent-position,
            consecutive-loss, and daily-loss-lock gates.
          </p>
        )}
        <CardDescription>
          {/*
            Describes the structural trigger (`result.direction`, which
            `useProtocolLevels` guarantees is armed), never `pattern`: the
            bar-sequence read is reference-only and is null on many armed
            setups, and dereferencing it here crashed the whole ticker page.
          */}
          {useProtocolLevels
            ? assetType === "options"
              ? `Trade ${symbol} options — protocol read is ${result.direction}.`
              : `${side === "buy" ? "Long" : "Short"} ${symbol} — armed structural entry trigger is ${result.direction}.`
            : levelChoice === "intraday"
              ? `${side === "buy" ? "Long" : "Short"} ${symbol} on the intraday plan's levels, at the market.`
              : `Manual ${side === "buy" ? "long" : "short"} execution for ${symbol} ${assetType === "options" ? "options" : ""} — no protocol levels attached${assetType === "shares" ? "; your own stop, TP1 and MTP below" : ""}.`}
        </CardDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-3" role="group" aria-label="Levels">
          <span className="text-xs font-semibold text-muted">Levels:</span>
          <LevelButton
            label="Swing plan"
            active={levelChoice === "swing" && hasProtocolSignal}
            disabled={!hasProtocolSignal}
            tone="accent"
            onClick={() => {
              setLevelChoice("swing");
              setTechniqueTrade(null);
            }}
            title={hasProtocolSignal ? "The daily plan's entry, stop, TP1 and MTP" : "No recommended daily plan for this symbol"}
          />
          <LevelButton
            label="Intraday plan"
            active={levelChoice === "intraday"}
            disabled={!intradayLevels && levelChoice !== "intraday"}
            tone="accent"
            onClick={() => {
              setLevelChoice("intraday");
              setTechniqueTrade(null);
              setAssetType("shares");
              if (intradaySide) setSide(intradaySide);
            }}
            title={
              intradayLevels
                ? "The intraday alert's stop, TP1 and MTP, at the market, managed within the session"
                : "No intraday plan stands for this symbol right now"
            }
          />
          <LevelButton
            label="My own levels"
            active={levelChoice === "own"}
            tone="warn"
            onClick={() => setLevelChoice("own")}
            title="Your own stop, TP1 and MTP"
          />
        </div>
        <div className="mt-2">
          {orderIntraday ? (
            <div className="flex flex-col gap-1 rounded border border-border p-2 text-xs text-muted">
              <p>
                <span className="font-semibold text-foreground">Trade style: {intradayStyle.label}.</span> {intradayStyle.summary}
              </p>
              <p>
                {levelChoice === "intraday"
                  ? intradayLevels
                    ? `The intraday plan: stop ${formatUsd(intradayLevels.stop)}, first target ${formatUsd(intradayLevels.target)}, ` +
                      (intradayMaster != null
                        ? `MTP ${formatUsd(intradayMaster)} (where the move is measured to; nothing sells there). `
                        : "no MTP. ")
                    : `No intraday plan stands for ${symbol} right now. Choose the swing plan or your own levels. `
                  : "Your own levels, managed on the session's rules: an intraday trade is placed with a stop and a first target. "}
                Once filled: {intradayStyle.trailRule.charAt(0).toLowerCase() + intradayStyle.trailRule.slice(1)}. Expected hold:{" "}
                {intradayStyle.expectedHold.toLowerCase()}.
              </p>
              {isCrypto ? (
                <p>Crypto trades around the clock, so there is no session to close at: the trade ends on its stop, its target or the hourly turn.</p>
              ) : (
                <label className="flex min-h-9 cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={!holdOvernight} onChange={(e) => setHoldOvernight(!e.target.checked)} />
                  Close what is left by the session&apos;s end (from 3:45 PM New York time)
                </label>
              )}
              <p className="text-warn">
                Intraday trades have no measured record yet: the method&apos;s replay at intraday scale has not shown an edge.
              </p>
            </div>
          ) : (
            // The swing plan and own levels are managed as a Swing trade; an
            // Intraday one is the intraday plan, or own levels managed that way
            // (lib/trade/tradeStyle.ts).
            <p className="text-xs text-muted">
              <span className="font-medium text-foreground">Swing</span>: {TRADE_STYLES.swing.summary} Expected hold:{" "}
              {TRADE_STYLES.swing.expectedHold.toLowerCase()}. For a trade in and out within the session, choose the
              intraday plan when one stands.
            </p>
          )}
        </div>
        {belowExecute && (
          <p className="mt-2 text-xs text-muted">
            The protocol rates this setup {verdict ?? "unrated"}, not Execute, so it is not a recommended trade. Its
            levels are shown for reference; an order here uses your own levels.
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Caught before submit — price has already traded through the setup's
            own stop, so the advised entry no longer reflects a live thesis. */}
        {protocolInvalidated && levels && breachPrice != null && (
          <div className="rounded-lg border border-bear/40 bg-bear-soft p-3 text-xs text-bear">
            <p className="font-medium">This setup is invalidated.</p>
            <p className="mt-1">
              Price {signalSide === "sell" ? "rose to" : "fell to"} {formatUsd(breachPrice)},
              through the {formatUsd(levels.stopLoss)} stop the {pattern ? PATTERN_GLOSSARY_TERM[pattern.name].toLowerCase() : "setup"}{" "}
              thesis was staked on. The advised entry at {formatUsd(advised)} is a dead level —
              placing this order at Protocol Recommended pricing is disabled. A plan whose stop has broken
              stays retired when price comes back to the entry: it stands again only if a bar closes back
              through the broken level by the usual allowance, and otherwise a new plan replaces it. Scan
              again to read it.
            </p>
            <button
              onClick={() => setLevelChoice("own")}
              className="mt-2 min-h-9 cursor-pointer font-medium underline underline-offset-2"
            >
              Use your own levels to trade anyway →
            </button>
          </div>
        )}

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
                // The intraday plan goes at the market: its alert has fired.
                disabled={levelChoice === "intraday"}
                title={
                  useProtocolLevels
                    ? "At advised price"
                    : techniqueEntry
                      ? `At ${techniqueEntry.label}'s entry`
                      : "At reference price"
                }
                subtitle={levelChoice === "intraday" ? "market only" : formatUsd(advised)}
              />
              <ModeButton
                active={entryMode === "now"}
                onClick={() => setEntryMode("now")}
                title={side === "buy" ? "Buy now (market)" : "Sell now (market)"}
                subtitle={currentPrice ? formatUsd(currentPrice) : "market"}
              />
            </div>

            <RoundNumberNotice
              price={entryMode === "advised" ? advised : currentPrice}
              direction={side === "buy" ? "bullish" : "bearish"}
            />
            <p className="text-xs text-muted">
              Trade only when you&apos;re rested and clear-headed. If you&apos;re tired, unwell or
              upset, the trade can wait.
            </p>

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
            ) : levelChoice === "intraday" ? (
              <div id="tour-exit" className="flex flex-col gap-2">
                {!intradayBracketCheck.ok && (
                  <div className="rounded-lg border border-warn/40 bg-warn-soft p-3 text-xs text-warn">
                    <p className="font-medium">The intraday plan&apos;s levels can&apos;t attach at today&apos;s price.</p>
                    <p className="mt-1">{intradayBracketCheck.reason}</p>
                  </div>
                )}
                {attachingIntradayLevels && manualExitPlan && (
                  <ExitPlanNotice
                    summary={manualExitPlan.summary}
                    splittable={manualExitPlan.splittable}
                    hasMaster={intradayMaster != null}
                  />
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">
                  Set a stop and TP1, and an MTP if you have one, and GSPS stages the exit itself, the
                  same way it does for a plan&apos;s levels. Every new position needs a stop; leave them
                  blank only to close a position you already hold.
                </p>
                {(levels && !planRetired) || intradayLevels ? (
                  <div className="flex flex-wrap gap-3 text-xs">
                    {levels && !planRetired && (
                      <button
                        type="button"
                        onClick={() => {
                          setTechniqueTrade(null);
                          setSide(signalSide);
                          setManualStop(priceField(levels.stopLoss));
                          setManualTarget(priceField(levels.takeProfit1));
                          setManualMaster(levels.masterProfit != null ? priceField(levels.masterProfit) : "");
                          setManageIntraday(false);
                        }}
                        className="min-h-9 cursor-pointer font-medium text-accent underline underline-offset-2"
                      >
                        Start from the swing plan
                      </button>
                    )}
                    {intradayLevels && intradaySide && (
                      <button
                        type="button"
                        onClick={() => {
                          setTechniqueTrade(null);
                          setSide(intradaySide);
                          setManualStop(priceField(intradayLevels.stop));
                          setManualTarget(priceField(intradayLevels.target));
                          setManualMaster(intradayLevels.master != null ? priceField(intradayLevels.master) : "");
                          setManageIntraday(true);
                          setEntryMode("now");
                        }}
                        className="min-h-9 cursor-pointer font-medium text-accent underline underline-offset-2"
                      >
                        Start from the intraday plan
                      </button>
                    )}
                  </div>
                ) : null}

                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Stop loss
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualStop}
                      onChange={(e) => setManualStop(e.target.value)}
                      placeholder="Stop"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    TP1
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualTarget}
                      onChange={(e) => setManualTarget(e.target.value)}
                      placeholder="First target"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    MTP
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={manualMaster}
                      onChange={(e) => setManualMaster(e.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                </div>
                {intradayAvailable && (
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={manageIntraday}
                      onChange={(e) => setManageIntraday(e.target.checked)}
                    />
                    Manage it as an intraday trade, in and out within the session
                  </label>
                )}
                {techniqueEntry && (
                  <p className="text-xs text-muted">
                    Trading {techniqueEntry.label}&apos;s own levels: entry{" "}
                    {formatUsd(techniqueEntry.entry)}, stop {formatUsd(techniqueEntry.stopLoss)}, TP1{" "}
                    {formatUsd(techniqueEntry.takeProfit1)}. It doesn&apos;t align with GSPS&apos;s plan,
                    so it has no MTP.{" "}
                    <button
                      type="button"
                      onClick={() => setTechniqueTrade(null)}
                      className="cursor-pointer font-medium underline underline-offset-2"
                    >
                      Clear
                    </button>
                  </p>
                )}
                {manualLevelsEntered && !manualLevelsComplete && (
                  <p className="text-xs text-muted">Enter both a stop and TP1 to attach your levels.</p>
                )}
                {manualLevelsBlocked && (
                  <p className="text-xs text-warn">{manualBracketCheck.reason}</p>
                )}
                {attachingManualLevels && manualExitPlan && (
                  <ExitPlanNotice
                    summary={manualExitPlan.summary}
                    splittable={manualExitPlan.splittable}
                    hasMaster={manualMasterEntered}
                  />
                )}
                {!manualLevelsEntered && (
                  <p className="text-xs text-muted">
                    No stop or target attached — this order carries no managed exit.
                  </p>
                )}
              </div>
            )}

            {/* Explain-only (AGENTS.md "Strategy Modes", 2026-10-16): shown in
                both modes, since what it explains is GSPS's plan, not the manual exit. */}
            {/* Novice (allowedStrategyModes === []) sees the explainer
                below instead of the selector — a designed counterpart,
                not silence. Both branches are server-resolved, not a
                client-side tier guess. See AGENTS.md's Polarity-audit
                section. */}
            {allowedStrategyModes && allowedStrategyModes.length === 0 && (
              <p className="rounded-lg border border-border p-3 text-xs text-muted">
                GSPS prices every trade plan from its own structural analysis. Seeing that plan
                explained through other techniques starts at Pro. For now, this plan is the one
                worth learning to read first.
              </p>
            )}
            {planRetired && explainPlan &&
              ((allowedStrategyModes?.length ?? 0) > 0 || (customScripts?.length ?? 0) > 0) && (
              <p className="rounded-lg border border-border p-3 text-xs text-muted">
                This plan is retired, so no technique can align with it. A new scan will either
                confirm it or replace it with a new plan.
              </p>
            )}
            {((allowedStrategyModes?.length ?? 0) > 0 || (customScripts?.length ?? 0) > 0) && (
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-xs">
                <p className="text-muted">
                  Other techniques (optional). The ones that align with GSPS&apos;s plan come first
                  and trade that plan. The others offer their own entry, stop and TP1, with no
                  MTP; trading one is your choice.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  disabled={techniqueStatus === "loading"}
                  onClick={readTechniques}
                >
                  {techniqueStatus === "loading"
                    ? "Reading…"
                    : techniques
                      ? "Read again"
                      : "Read every technique"}
                </Button>
                {techniqueStatus === "error" && <p className="text-warn">{techniqueError}</p>}
                {techniqueStatus === "ready" && techniques?.length === 0 && (
                  <p className="text-muted">No technique has a reading on this symbol right now.</p>
                )}
                {techniques && techniques.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {techniques.map((t) => (
                      <TechniqueRow
                        key={t.source}
                        technique={t}
                        onShow={() => showTechnique(t.source)}
                        onTrade={() => tradeTechnique(t)}
                        trading={techniqueEntry?.source === t.source}
                      />
                    ))}
                  </ul>
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

/** A technique's price for the manual fields: cents, or four places under $1. */
function priceField(n: number): string {
  return n >= 1 ? n.toFixed(2) : n.toFixed(4);
}

/**
 * One technique against GSPS's plan (lib/strategies/compare.ts). An aligned
 * technique trades the plan, so it shows its reading of the plan's levels. Any
 * other shows its own entry, stop and TP1, never an MTP, with a button the
 * person may use to trade it as a Manual Override.
 */
function TechniqueRow({
  technique: t,
  onShow,
  onTrade,
  trading,
}: {
  technique: TechniqueRead;
  onShow: () => void;
  onTrade: () => void;
  trading: boolean;
}) {
  const own = t.ownLevels;
  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-md p-2",
        t.aligned ? "border border-bull/40 bg-bull-soft" : "bg-surface-alt",
      )}
    >
      <p className="font-medium">
        {t.label}{" "}
        <span className={t.aligned ? "text-bull" : "text-muted"}>
          {t.aligned
            ? "· aligns with GSPS's plan"
            : own
              ? `· its own ${own.direction === "bullish" ? "long" : "short"}`
              : "· nothing armed"}
        </span>
      </p>
      {t.reading && (
        <p className={t.reading.agrees === false ? "text-warn" : "text-muted"}>{t.reading.summary}</p>
      )}
      {t.aligned && t.reading && t.reading.levels.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-muted">
          {t.reading.levels.map((l) => (
            <li key={l.level}>{l.text}</li>
          ))}
        </ul>
      )}
      {own && (
        <>
          <p>
            Entry {formatUsd(own.entry)} · Stop {formatUsd(own.stopLoss)} · TP1{" "}
            {formatUsd(own.takeProfit1)} · no MTP
          </p>
          <p className="text-muted">{own.rationale}</p>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onShow}
          className="min-h-9 cursor-pointer font-medium text-accent underline underline-offset-2"
        >
          Show on chart
        </button>
        {own && (
          <button
            type="button"
            onClick={onTrade}
            disabled={trading}
            className="min-h-9 cursor-pointer font-medium text-accent underline underline-offset-2 disabled:cursor-default disabled:no-underline disabled:text-muted"
          >
            {trading ? "Trading these levels" : "Trade these levels"}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * What the protocol will do on the way out.
 *
 * This sits under the checkbox because "attach protocol levels" no longer means
 * one bracket that exits the whole position. Since Q14 (2026-10-16) it means
 * no fixed target: the whole position runs behind a stop that moves to
 * break-even and then on the swings, and leaves on the method's exit signals. A user who presses the
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
          Once the trade has gained as much as it risked, the stop moves to your entry. After that it
          moves up under each higher swing bottom, and under last month&apos;s low once a new month
          starts. The position is closed if price falls back under the level it broke out of, closes
          against the trade three days running, or the trend turns.
          {hasMaster
            ? " If price pushes through the MTP (master take profit) and falls back through it, the rest is closed."
            : ""}{" "}
          The stop moves while the app is open; the stop resting at the broker is what protects the
          position the rest of the time.
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
  active, onClick, title, subtitle, disabled = false,
}: { active: boolean; onClick: () => void; title: string; subtitle: string; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-12 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
        active ? "border-accent bg-accent-soft" : "border-border hover:border-muted",
        disabled && "cursor-not-allowed opacity-50 hover:border-border",
      )}
    >
      <p className={cn("text-sm font-medium", active && "text-accent")}>{title}</p>
      <p className="font-mono text-xs text-muted tabular-nums">{subtitle}</p>
    </button>
  );
}

/** One of the ticket's level choices: the swing plan, the intraday plan, or the person's own. */
function LevelButton({
  label, active, disabled = false, tone, onClick, title,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  tone: "accent" | "warn";
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={title}
      className={cn(
        "min-h-9 rounded px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors",
        active
          ? tone === "warn"
            ? "bg-warn text-surface"
            : "bg-accent text-surface"
          : cn("border border-border text-muted", tone === "warn" ? "hover:border-warn" : "hover:border-accent"),
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      {label}
    </button>
  );
}
