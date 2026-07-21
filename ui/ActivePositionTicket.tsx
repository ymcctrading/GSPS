/**
 * NinjaTrader-inspired pinned position ticket.
 *
 * When a position is live, the order form morphs into a live exposure monitor:
 *  - large color-shifting P/L header (emerald profit / crimson loss)
 *  - tap the header to cycle $ -> % -> points
 *  - MARKET EXIT / REVERSE emergency overrides
 *
 * Framework-free P/L math lives in ./lib/pnl so it is unit-tested separately.
 * Drop into the ticker detail view's pinned right column (see docs/CHARTING_SPEC).
 */

import React, { useState } from "react";
import {
  computePnl,
  formatPnl,
  NEXT_MODE,
  type PnlDisplayMode,
  type PositionExposure,
} from "./lib/pnl";

export interface ActivePositionTicketProps {
  position: PositionExposure;
  onMarketExit?: () => void;
  onReverse?: () => void;
}

export function ActivePositionTicket({
  position,
  onMarketExit,
  onReverse,
}: ActivePositionTicketProps) {
  const [mode, setMode] = useState<PnlDisplayMode>("DOLLAR");
  const pnl = computePnl(position);
  const isProfit = pnl.isProfit;

  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-xl border border-[#30363D] bg-[#161B22] shadow-xl sticky top-4"
      data-testid="active-position-ticket"
    >
      {/* Live P/L header — tap to cycle metric */}
      <button
        type="button"
        onClick={() => setMode((m) => NEXT_MODE[m])}
        className={`w-full cursor-pointer p-6 text-center transition-colors duration-200 ${
          isProfit
            ? "bg-[#1C2A3A] border-b border-[#4CD964]"
            : "bg-[#2A1C1C] border-b border-[#FF3B30]"
        }`}
        aria-label="Cycle P/L display"
      >
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#8B949E]">
          Active Real-Time P/L (Tap to Cycle)
        </span>
        <span
          className={`block font-mono text-3xl font-bold ${
            isProfit ? "text-[#4CD964]" : "text-[#FF3B30]"
          }`}
        >
          {formatPnl(pnl, mode)}
        </span>
      </button>

      {/* Position meta */}
      <div className="space-y-3 p-4 text-sm">
        <Row label="Asset & Size">
          {position.symbol} • {position.side ?? "Long"} {position.qty}
        </Row>
        <Row label="Avg Entry Price">${position.entryPrice.toFixed(2)}</Row>
        <Row label="Last Traded Price">${position.currentPrice.toFixed(2)}</Row>
      </div>

      {/* Emergency overrides */}
      <div className="flex gap-3 border-t border-[#30363D] bg-[#0A0E17] p-4">
        <button
          type="button"
          onClick={onMarketExit}
          className="flex-1 rounded-lg bg-[#FF3B30] px-4 py-3 text-sm font-bold tracking-wide text-white transition-colors hover:bg-[#D32F2F]"
        >
          MARKET EXIT
        </button>
        <button
          type="button"
          onClick={onReverse}
          className="flex-1 rounded-lg border border-[#30363D] bg-[#21262D] px-4 py-3 text-sm font-bold tracking-wide text-[#8B949E] transition-all hover:text-white"
        >
          REVERSE
        </button>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#8B949E]">{label}</span>
      <span className="font-mono font-medium text-white">{children}</span>
    </div>
  );
}

export default ActivePositionTicket;
