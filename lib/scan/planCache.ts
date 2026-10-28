/**
 * The symbol page's plan, kept for the session it was made from.
 * -----------------------------------------------------------------------------
 * Owner, 2026-10-28: reopening a symbol page re-ran the whole scan, though its
 * entry, stop, TP1 and MTP do not move during the day; only the price, the
 * chart and the intraday read need loading again.
 *
 * Gann answers when a plan changes. It is read from completed sessions: the
 * entry follows a close 3 points past the old level and is bought on the
 * reaction, the stop goes in with the order (W006 Rule 3, pp.46-47), and the
 * 3-Day Chart turns only on a finished day. So the plan stands until one of
 * these, and the page reads it again only then:
 *
 * - **A session closes** (`planSessionKey` moves): a new daily bar, new swings
 *   and levels.
 * - **Price trades through the stop** (`planEvent` "stop"): the plan is
 *   broken, and its replacement is a new trade from the new structure, never
 *   the old levels resumed (NSTD Rule 6; Overnight Chart rule 4;
 *   `lib/gann/stopBreach.ts`). The scan reads that break, so it is asked again.
 * - **A setup at the Execute cutoff** whose price ran past TP1 or moved a
 *   day's range from its entry (`planEvent` "target" / "resting"): the owner's
 *   2026-10-27 rule that Execute means placeable now (`applyReadyNowHold`,
 *   `lib/setups/resting.ts`) reads today's price, so it can change in the
 *   session while the levels do not.
 *
 * Each event is read against the price the plan was scanned at, so a plan
 * whose scan already saw the condition never asks again for it.
 *
 * Kept in memory (client navigation reuses it) and in sessionStorage (a reload
 * of the tab does), never localStorage: the result is redacted per member and
 * tier, and the tab's storage is cleared on sign-out (`clearCachedPlans`).
 *
 * Three questions (AGENTS.md mandate). 1. Gann: above. 2. Cycles: no claim of
 * periodicity; the session is the method's own unit of time. 3. Hermetic:
 * Cause and Effect: the plan is re-read when a cause that changes it occurs,
 * not on a clock. Law of Creation: plan ⊗ price, two poles that interact only
 * at the plan's own levels; elsewhere they are a mixture and nothing new needs
 * computing.
 */

import { etDateKey } from "@/lib/market/session";
import { isEarlyClose, isMarketHoliday } from "@/lib/market/calendar";
import { isResting } from "@/lib/setups/resting";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";
import type { AssetClass, ScanResult } from "@/lib/types";

const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

const ET_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function etMinutes(date: Date): number {
  const parts = ET_CLOCK.formatToParts(date);
  let hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  if (hour === 24) hour = 0;
  return hour * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

/** The "YYYY-MM-DD" `days` calendar days before `key`. */
function shiftKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days, 12)).toISOString().slice(0, 10);
}

function isTradingKey(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isMarketHoliday(key);
}

/**
 * The last completed session a plan read at `now` is made from: for a US
 * equity, the New York date of the latest close at or before `now` (1:00 PM on
 * an early close); for crypto, the UTC date, where its daily bar ends.
 */
export function planSessionKey(assetClass: AssetClass, now: Date = new Date()): string {
  if (assetClass === "crypto") return now.toISOString().slice(0, 10);
  const today = etDateKey(now);
  if (isTradingKey(today)) {
    const close = isEarlyClose(today) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
    if (etMinutes(now) >= close) return today;
  }
  for (let back = 1; back <= 10; back++) {
    const key = shiftKey(today, back);
    if (isTradingKey(key)) return key;
  }
  return today;
}

export type PlanEvent = "stop" | "target" | "resting";

type PlanFields = Pick<ScanResult, "direction" | "currentPrice" | "levels" | "stopBreach" | "dayRange" | "decision">;

/**
 * The event in the session that asks for the plan to be read again at
 * `livePrice`, or null while the plan stands. A retired plan (its stop already
 * broken) has none: it waits for the next session's plan.
 */
export function planEvent(result: PlanFields, livePrice: number | null | undefined): PlanEvent | null {
  const levels = result.levels;
  if (!levels || result.stopBreach || result.direction === "none") return null;
  if (livePrice == null || !Number.isFinite(livePrice) || !(livePrice > 0)) return null;
  const buy = result.direction === "bullish";
  const scanPrice = result.currentPrice;

  const through = (price: number, level: number) => (buy ? price <= level : price >= level);
  if (Number.isFinite(levels.stopLoss) && through(livePrice, levels.stopLoss) && !through(scanPrice, levels.stopLoss)) {
    return "stop";
  }

  if (!(result.decision.score >= EXECUTE_SCORE_THRESHOLD)) return null;

  const past = (price: number, level: number) => (buy ? price >= level : price <= level);
  if (Number.isFinite(levels.takeProfit1) && past(livePrice, levels.takeProfit1) && !past(scanPrice, levels.takeProfit1)) {
    return "target";
  }

  const restingAt = (price: number) =>
    isResting({
      side: buy ? "buy" : "sell",
      price,
      entry: levels.entry,
      dayRange: result.dayRange,
      tp1: levels.takeProfit1,
      mtp: levels.masterProfit,
    });
  if (restingAt(livePrice) !== restingAt(scanPrice)) return "resting";
  return null;
}

/** What the symbol page keeps: the result and how its score is shown. */
export interface CachedPlan {
  result: ScanResult;
  exactScoreDisplayEnabled: boolean;
  /** `planSessionKey` when it was stored. */
  session: string;
  /** Epoch ms it was stored. */
  storedAt: number;
}

const PREFIX = "gsps:plan:v1:";
/** How many symbols the tab keeps; the oldest goes first. */
export const MAX_CACHED_PLANS = 12;

const memory = new Map<string, CachedPlan>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function storedKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

function isCachedPlan(value: unknown): value is CachedPlan {
  const v = value as CachedPlan | null;
  return (
    v != null &&
    typeof v === "object" &&
    typeof v.session === "string" &&
    typeof v.storedAt === "number" &&
    v.result != null &&
    typeof v.result === "object" &&
    typeof v.result.symbol === "string"
  );
}

/** The plan kept for `symbol`, while its session is still the current one. */
export function readCachedPlan(symbol: string, now: Date = new Date()): CachedPlan | null {
  const key = PREFIX + symbol.toUpperCase();
  let plan = memory.get(key) ?? null;
  if (!plan) {
    const store = storage();
    try {
      const raw = store?.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      plan = isCachedPlan(parsed) ? parsed : null;
    } catch {
      plan = null;
    }
    if (plan) memory.set(key, plan);
  }
  if (!plan) return null;
  if (plan.session !== planSessionKey(plan.result.assetClass, now)) {
    forgetCachedPlan(symbol);
    return null;
  }
  return plan;
}

/** Keep a successful scan for the rest of its session. */
export function writeCachedPlan(
  symbol: string,
  result: ScanResult,
  exactScoreDisplayEnabled: boolean,
  now: Date = new Date(),
): CachedPlan {
  const key = PREFIX + symbol.toUpperCase();
  const plan: CachedPlan = {
    result,
    exactScoreDisplayEnabled,
    session: planSessionKey(result.assetClass, now),
    storedAt: now.getTime(),
  };
  memory.delete(key);
  memory.set(key, plan);
  while (memory.size > MAX_CACHED_PLANS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  const store = storage();
  if (store) {
    try {
      store.setItem(key, JSON.stringify(plan));
      const kept = storedKeys(store)
        .map((k) => {
          try {
            const p: unknown = JSON.parse(store.getItem(k) ?? "null");
            return { k, at: isCachedPlan(p) ? p.storedAt : 0 };
          } catch {
            return { k, at: 0 };
          }
        })
        .sort((a, b) => b.at - a.at);
      for (const { k } of kept.slice(MAX_CACHED_PLANS)) store.removeItem(k);
    } catch {
      // Full or blocked storage: the memory copy still serves this tab.
    }
  }
  return plan;
}

export function forgetCachedPlan(symbol: string): void {
  const key = PREFIX + symbol.toUpperCase();
  memory.delete(key);
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

/** Every kept plan, on sign-out. */
export function clearCachedPlans(): void {
  memory.clear();
  const store = storage();
  if (!store) return;
  try {
    for (const k of storedKeys(store)) store.removeItem(k);
  } catch {
    // Nothing to clear.
  }
}
