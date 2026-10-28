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
 * - **A session completes** (`planSessionKey` moves): the scan takes in
 *   today's bar from New York midnight (`scanTicker`'s `sessionDay`, as the
 *   replay reads it), so the kept plan rolls at the same moment, never at the
 *   exchange close, which would keep a plan that lacks the day's bar.
 * - **The regular session opens or closes** (also in `planSessionKey`, US
 *   equities): on the delayed feed the scan holds an Execute to Watch while
 *   prices move underneath it (`applyDataLagHold`), so a plan read before the
 *   open is not the plan during it.
 * - **Price trades through the stop** (`planEvent` "stop"): the plan is
 *   broken, and its replacement is a new trade from the new structure, never
 *   the old levels resumed (NSTD Rule 6; Overnight Chart rule 4;
 *   `lib/gann/stopBreach.ts`). The scan reads that break, so it is asked again.
 * - **Price back past a broken plan's reclaim line** ("reclaim"): Gann's
 *   failed break, a closed bar back through the line by his allowance,
 *   confirms the plan again (`readStopBreach`). The scan decides that on its
 *   closed bars; the price only says when to ask.
 * - **A setup at the Execute cutoff** whose price crossed TP1 or a day's
 *   range from its entry, either way (`planEvent` "target" / "resting"): the
 *   owner's 2026-10-27 rule that Execute means placeable now
 *   (`applyReadyNowHold`, `lib/setups/resting.ts`) reads today's price, so it
 *   can change in the session while the levels do not.
 *
 * Known limit, recorded rather than hidden: some of the scan's readings take
 * today's price (the lattice points it adds around price, the ATR in percent,
 * the 15-minute bars behind the stop's allowance), so a fresh scan later in
 * the day can price TP1 or MTP a little differently from the kept plan. The
 * page shows when its plan was read and offers a refresh.
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

import { equitySession, etDateKey } from "@/lib/market/session";
import { isResting } from "@/lib/setups/resting";
import { EXECUTE_SCORE_THRESHOLD } from "@/lib/scoring/weights";
import type { AssetClass, ScanResult } from "@/lib/types";

/**
 * Which plan a read at `now` belongs to: the New York date the scan reads its
 * completed sessions to (`scanTicker`'s `sessionDay`), and for a US equity
 * whether the regular session is open, since the delayed-feed hold reads it.
 */
export function planSessionKey(assetClass: AssetClass, now: Date = new Date()): string {
  const day = etDateKey(now);
  if (assetClass === "crypto") return day;
  return `${day}:${equitySession(now) === "regular" ? "open" : "shut"}`;
}

export type PlanEvent = "stop" | "reclaim" | "target" | "resting";

type PlanFields = Pick<ScanResult, "direction" | "currentPrice" | "levels" | "stopBreach" | "dayRange" | "decision">;

/** Today's high and low so far, from the quote; either may be unknown. */
export interface DayExtremes {
  high: number | null | undefined;
  low: number | null | undefined;
}

/**
 * The event in the session that asks for the plan to be read again at
 * `livePrice`, or null while the plan stands. Each is read against the price
 * the plan was scanned at, so a condition the scan already saw never asks,
 * except the reclaim, which the scan confirms only on a closed bar and so is
 * asked while it holds (the page paces it a bar apart).
 *
 * The stop also reads the day's extreme on the plan's adverse side: the scan
 * retires a plan on any of the session's bars through the stop that has not
 * closed back, so a poke between two quotes, or while the page was closed,
 * counts as well.
 */
export function planEvent(
  result: PlanFields,
  livePrice: number | null | undefined,
  day?: DayExtremes | null,
): PlanEvent | null {
  const levels = result.levels;
  if (!levels || result.direction === "none") return null;
  if (livePrice == null || !Number.isFinite(livePrice) || !(livePrice > 0)) return null;
  const buy = result.direction === "bullish";
  const scanPrice = result.currentPrice;

  if (result.stopBreach) {
    const reclaim = result.stopBreach.reclaimAt;
    if (!Number.isFinite(reclaim)) return null;
    return (buy ? livePrice >= reclaim : livePrice <= reclaim) ? "reclaim" : null;
  }

  const through = (price: number | null | undefined, level: number) =>
    price != null && Number.isFinite(price) && price > 0 && (buy ? price <= level : price >= level);
  const adverse = buy ? day?.low : day?.high;
  if (
    Number.isFinite(levels.stopLoss) &&
    (through(livePrice, levels.stopLoss) || through(adverse, levels.stopLoss)) &&
    !through(scanPrice, levels.stopLoss)
  ) {
    return "stop";
  }

  if (!(result.decision.score >= EXECUTE_SCORE_THRESHOLD)) return null;

  const past = (price: number, level: number) => (buy ? price >= level : price <= level);
  if (Number.isFinite(levels.takeProfit1) && past(livePrice, levels.takeProfit1) !== past(scanPrice, levels.takeProfit1)) {
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

/** The level an event was read at, so one event on one plan asks only once. */
export function planEventLevel(result: PlanFields, event: PlanEvent): number | null {
  const l = result.levels;
  if (event === "reclaim") return result.stopBreach?.reclaimAt ?? null;
  if (event === "stop") return l?.stopLoss ?? null;
  if (event === "target") return l?.takeProfit1 ?? null;
  return l?.entry ?? null;
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
    typeof v.result.symbol === "string" &&
    v.result.decision != null &&
    typeof v.result.decision.score === "number"
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
    // The session the scan read, not the moment it returned: a scan begun a
    // second before the open has no open-market hold.
    session: planSessionKey(result.assetClass, scannedAtOr(result.scannedAt, now)),
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

function scannedAtOr(iso: string | undefined, fallback: Date): Date {
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) ? at : fallback;
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

const OWNER_KEY = "gsps:plan:owner";
/** The owner when sessionStorage can't be read (and in tests). */
let memoryOwner: string | null = null;

/**
 * Ties the tab's kept plans to the signed-in member: a plan is redacted for
 * its member and tier, so when another member (or nobody) is signed in, every
 * kept plan goes. Returns true when it cleared them.
 */
export function bindCachedPlansTo(userId: string | null): boolean {
  const store = storage();
  let owner: string | null = memoryOwner;
  try {
    if (store) owner = store.getItem(OWNER_KEY);
  } catch {
    // Blocked storage: the memory owner stands in.
  }
  const changed = owner !== userId;
  if (changed) clearCachedPlans();
  memoryOwner = userId;
  try {
    if (userId) store?.setItem(OWNER_KEY, userId);
    else store?.removeItem(OWNER_KEY);
  } catch {
    // Blocked storage keeps nothing to leak.
  }
  return changed && owner != null;
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
