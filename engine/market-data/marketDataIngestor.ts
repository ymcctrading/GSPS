/**
 * Dual-mode market-data ingestion.
 *
 * Production: WebSocket client for an institutional provider (Polygon/Alpaca-style).
 * Development: high-fidelity simulated random-walk feed used automatically when no
 * live credentials are present — so the automation engine can be built, tested,
 * and run right now, then flip to a real feed once API keys are set.
 *
 * The `ws` import is done lazily so this module can be unit-tested (and bundled
 * for the simulated path) without the dependency installed.
 */

import type { AssetClass, MarketTick } from "../automation/multiAssetAutomationController";

export interface TickSink {
  processRealTimeTick(tick: MarketTick, userId: string): Promise<void>;
}

export interface IngestorConfig {
  useSimulation?: boolean;
  wsUrl?: string;
  apiKey?: string;
  /** userId whose profile drives automation for ingested ticks. */
  userId: string;
  /** Simulated-feed emit interval (ms). */
  simIntervalMs?: number;
}

/** Which feed the engine is (or would be) running: real provider vs. fallback. */
export type FeedMode = "live" | "simulated";

/**
 * Resolve the active market-data feed mode from config and/or environment —
 * the single source of truth shared by the ingestor and the /api/health check.
 *
 * Mirrors the ingestor's own fallback rule: an explicit `useSimulation` wins,
 * otherwise we run "live" only when BOTH a WS url and an API key are present.
 * By default it reads `MARKET_DATA_WS_URL` + `MARKET_DATA_API_KEY`, so a health
 * check can report whether the switch flipped without constructing an ingestor.
 */
export function activeFeedMode(
  opts: Partial<Pick<IngestorConfig, "useSimulation" | "wsUrl" | "apiKey">> = {},
): FeedMode {
  const wsUrl = opts.wsUrl ?? process.env.MARKET_DATA_WS_URL;
  const apiKey = opts.apiKey ?? process.env.MARKET_DATA_API_KEY;
  const simulated = opts.useSimulation ?? (!apiKey || !wsUrl);
  return simulated ? "simulated" : "live";
}

interface SimAsset {
  symbol: string;
  base: number;
  assetClass: AssetClass;
}

const SIM_WATCHLIST: SimAsset[] = [
  { symbol: "NOK", base: 4.91, assetClass: "STOCK" },
  { symbol: "AAPL", base: 185.2, assetClass: "STOCK" },
  { symbol: "BTCUSD", base: 64250.0, assetClass: "CRYPTO" },
];

export class MarketDataIngestor {
  private readonly isSimulation: boolean;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ws: unknown = null;
  private running = false;

  constructor(
    private readonly sink: TickSink,
    private readonly config: IngestorConfig,
  ) {
    // Auto-fallback to simulation when no live credentials are configured.
    this.isSimulation = activeFeedMode(config) === "simulated";
  }

  /** The feed this instance is actually running: "live" or "simulated". */
  activeFeedMode(): FeedMode {
    return this.isSimulation ? "simulated" : "live";
  }

  connect(): void {
    this.running = true;
    if (this.isSimulation) {
      console.log(
        "⚠️  Live ticker credentials missing. Initializing High-Fidelity Simulated Live Stream…",
      );
      this.startSimulatedFeed();
    } else {
      console.log("🔌 Initializing Production Live WebSocket Connection…");
      void this.initializeLiveWebSocket();
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ws = this.ws as { close?: () => void } | null;
    ws?.close?.();
    this.ws = null;
  }

  private startSimulatedFeed(): void {
    const assets = SIM_WATCHLIST.map((a) => ({ ...a }));
    const interval = this.config.simIntervalMs ?? 500;

    this.timer = setInterval(() => {
      if (!this.running) return;
      const asset = assets[Math.floor(Math.random() * assets.length)];
      const changePct = (Math.random() - 0.5) * 0.001; // small random walk
      asset.base *= 1 + changePct;

      const tick: MarketTick = {
        assetClass: asset.assetClass,
        symbol: asset.symbol,
        lastPrice: Number(
          asset.base.toFixed(asset.assetClass === "CRYPTO" ? 2 : 4),
        ),
        timestamp: new Date(),
      };
      void this.sink.processRealTimeTick(tick, this.config.userId);
    }, interval);
  }

  private async initializeLiveWebSocket(): Promise<void> {
    // Lazy import keeps `ws` optional for simulation/testing.
    const { default: WebSocket } = await import("ws");
    const url = this.config.wsUrl!;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.on("open", () => {
      ws.send(JSON.stringify({ action: "auth", params: this.config.apiKey }));
      ws.send(
        JSON.stringify({ action: "subscribe", params: "T.NOK,T.AAPL,T.BTCUSD" }),
      );
    });

    ws.on("message", (data: Buffer) => {
      const tick = this.normalize(JSON.parse(data.toString()));
      if (tick) void this.sink.processRealTimeTick(tick, this.config.userId);
    });

    ws.on("close", () => {
      if (this.running) setTimeout(() => this.initializeLiveWebSocket(), 5000);
    });
  }

  /** Map a raw provider packet into the unified MarketTick shape. */
  private normalize(raw: any): MarketTick | null {
    if (!raw || typeof raw.sym !== "string") return null;
    return {
      assetClass: (raw.assetClass as AssetClass) ?? "STOCK",
      symbol: raw.sym,
      lastPrice: Number(raw.p),
      timestamp: new Date(raw.t ?? Date.now()),
    };
  }
}
