/**
 * Master unified execution controller — the "automated portfolio manager".
 *
 * Intercepts real-time ticks and orchestrates hands-free execution based on the
 * user's active automation profile, routing by asset class:
 *
 *   STOCK / OPTION      -> equities & options (options-chain routing)
 *   FUTURE / COMMODITY  -> dynamic contract sizing
 *   FOREX / CRYPTO      -> continuous 24/5 & 24/7 trailing-stop management
 *
 * Only users on the SYSTEM_MASTERY tier with automation enabled are acted upon.
 * All broker/data access is injected so the controller is testable in isolation.
 */

import { assertFeature, type PlatformTier } from "../tiers/entitlements";
import {
  calculateFuturesLotSize,
  type RiskProfile,
} from "./riskPositionSizer";
import {
  findOptimalContract,
  type OptionContract,
} from "./optionsChainParser";
import {
  AutomationState,
  evaluateTrailingStop,
  type ManagedAssetTracker,
} from "./assetLifecycleEngine";

export type AssetClass =
  | "STOCK"
  | "OPTION"
  | "FUTURE"
  | "COMMODITY"
  | "FOREX"
  | "CRYPTO";

export interface MarketTick {
  assetClass: AssetClass;
  symbol: string;
  lastPrice: number;
  timestamp: Date;
  /** Present for reversion-triggering equity ticks. */
  reversionSignal?: "BULLISH" | "BEARISH";
  /** ATR estimate for futures sizing. */
  atr?: number;
}

export interface AutomationProfile {
  userId: string;
  tier: PlatformTier;
  isAutomationEnabled: boolean;
  riskProfile: RiskProfile;
  directionalBias: "BULLISH_ONLY" | "BEARISH_ONLY" | "BOTH";
  accountEquity: number;
}

export interface ExecutionOrder {
  userId: string;
  assetClass: AssetClass;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  kind: "SHARES" | "OPTION_CONTRACT" | "FUTURES_LOT";
  contractSymbol?: string;
  automated: true;
}

export interface ControllerDeps {
  getProfile: (userId: string) => Promise<AutomationProfile | null>;
  fetchOptionChain: (ticker: string) => Promise<OptionContract[]>;
  submitOrder: (order: ExecutionOrder) => Promise<void>;
  /** Persistent trailing trackers keyed by `${userId}:${symbol}`. */
  trackers: Map<string, ManagedAssetTracker>;
}

export class MultiAssetAutomationController {
  constructor(private readonly deps: ControllerDeps) {}

  async processRealTimeTick(tick: MarketTick, userId: string): Promise<void> {
    const profile = await this.deps.getProfile(userId);
    if (!profile || !profile.isAutomationEnabled) return;

    // Hard gate: autonomous management is System Mastery only.
    try {
      assertFeature(profile.tier, "autonomous_portfolio_manager");
    } catch {
      return; // silent discard for non-entitled tiers
    }

    switch (tick.assetClass) {
      case "STOCK":
      case "OPTION":
        await this.handleEquitiesAndOptions(tick, profile);
        break;
      case "FUTURE":
      case "COMMODITY":
        await this.handleHighLeverageFutures(tick, profile);
        break;
      case "FOREX":
      case "CRYPTO":
        await this.handleContinuousStreams(tick, profile);
        break;
    }
  }

  /** 1. Equities & Options — route reversion triggers into ITM option contracts. */
  private async handleEquitiesAndOptions(
    tick: MarketTick,
    profile: AutomationProfile,
  ): Promise<void> {
    if (!tick.reversionSignal) return;
    if (!this.biasAllows(profile.directionalBias, tick.reversionSignal)) return;

    const contract = await findOptimalContract(
      { underlyingTicker: tick.symbol, bias: tick.reversionSignal },
      this.deps.fetchOptionChain,
      tick.timestamp,
    );
    if (!contract) return;

    await this.deps.submitOrder({
      userId: profile.userId,
      assetClass: "OPTION",
      symbol: tick.symbol,
      side: "buy",
      qty: 1,
      kind: "OPTION_CONTRACT",
      contractSymbol: contract.contractSymbol,
      automated: true,
    });
  }

  /** 2. Futures & Commodities — size contracts dynamically against the risk dial. */
  private async handleHighLeverageFutures(
    tick: MarketTick,
    profile: AutomationProfile,
  ): Promise<void> {
    if (!tick.reversionSignal) return;
    if (!this.biasAllows(profile.directionalBias, tick.reversionSignal)) return;

    const atr = tick.atr ?? tick.lastPrice * 0.005;
    const lots = calculateFuturesLotSize({
      accountEquity: profile.accountEquity,
      riskProfile: profile.riskProfile,
      ticker: tick.symbol,
      currentAtr: atr,
    });
    if (lots <= 0) return;

    await this.deps.submitOrder({
      userId: profile.userId,
      assetClass: tick.assetClass,
      symbol: tick.symbol,
      side: tick.reversionSignal === "BULLISH" ? "buy" : "sell",
      qty: lots,
      kind: "FUTURES_LOT",
      automated: true,
    });
  }

  /** 3. Forex (24/5) & Crypto (24/7) — trail stops continuously, out of hours. */
  private async handleContinuousStreams(
    tick: MarketTick,
    profile: AutomationProfile,
  ): Promise<void> {
    const key = `${profile.userId}:${tick.symbol}`;
    const tracker = this.deps.trackers.get(key);
    if (!tracker || tracker.currentState !== AutomationState.MONITORING_TRAILING)
      return;

    const result = evaluateTrailingStop(tracker, tick.lastPrice);
    if (result.action === "EXIT") {
      await this.deps.submitOrder({
        userId: profile.userId,
        assetClass: tick.assetClass,
        symbol: tick.symbol,
        side: tracker.side === "LONG" ? "sell" : "buy",
        qty: 0, // close full position; sizing resolved by execution layer
        kind: "SHARES",
        automated: true,
      });
      this.deps.trackers.delete(key);
    }
    // UPDATE_STOP mutates the tracker in place; persistence handled by caller.
  }

  private biasAllows(
    bias: AutomationProfile["directionalBias"],
    signal: "BULLISH" | "BEARISH",
  ): boolean {
    if (bias === "BOTH") return true;
    return bias === "BULLISH_ONLY"
      ? signal === "BULLISH"
      : signal === "BEARISH";
  }
}
