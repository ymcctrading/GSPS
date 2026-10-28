/**
 * GSPS — when market data may enter a decision (owner, 2026-10-28,
 * DATA-DELAY-001 and the platform-wide delay directive).
 *
 * Equity data reaches GSPS 15 minutes late (the feed's contract, confirmed by
 * the owner). `latency.ts` already turns that delay into a lag ratio that holds
 * Execute while prices move. This module is the other half of the contract:
 * which observations a decision may read at all, and when an order could act
 * on it. One definition, read by the live intraday scan, the notifications,
 * placement and the replays, so no surface carries its own idea of the delay.
 *
 * The facts are kept apart, as the directive asks:
 * - entitlement: what the feed is (delayed, real-time, unknown, unavailable),
 *   resolved on the server from the instrument and the source, never from a
 *   chart selector, a request or a member's tier;
 * - the contractual delay that follows from it;
 * - a candle's open and close (the provider stamps a bar with its OPEN; the
 *   close is derived here, clipped to the session's close on a short final
 *   candle and an early-close day);
 * - modeled availability, close + delay, and actual receipt where recorded:
 *   usable = max(modeled, received);
 * - the evaluation clock: an observation enters a decision only when
 *   usable <= evaluatedAt;
 * - the age of the newest usable observation, null (never 0) when unknown;
 * - the earliest an order could act on a decision, and on bars the first bar
 *   opening at or after it.
 *
 * Real-time is a verified transition, not a flag (owner: "Once the applicable
 * real-time feed is purchased, configured and verified, remove restrictions
 * attributable specifically to that contractual delay"). `MARKET_DATA_REALTIME`
 * declares the purchase; it lifts the delay only once
 * `MARKET_DATA_REALTIME_VERIFIED_AT` records when an operator checked a live
 * trade arriving within seconds. Declared but unverified reads as delayed. A
 * real-time feed still has stale observations: `staleUnderRealtime` holds one
 * whose age is beyond a bar, which is genuine stale-data protection, not the
 * contract.
 *
 * Mandate: 1. No Gann rule of its own; it guards the one Gann always kept,
 * that a decision is made on what the tape has actually shown (he judged his
 * charts after the close, *Truth of the Stock Tape* pp. 5-7). 2. No
 * periodicity claim; Dewey N/A. 3. Cause and Effect: an observation is the
 * cause of a decision only once it could have been seen; Correspondence: the
 * live scan and the replay read the same clock. Law of Creation: the bar ⊗ the
 * clock gives the usable bar; neither alone says what a decision may read.
 */

import type { AssetClass, Bar, Timeframe } from "@/lib/types";
import { TF_INTERVAL_MS } from "@/lib/timeframe";
import { etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose } from "@/lib/market/calendar";

/** The equity feed's contractual delay (the owner's confirmed 15 minutes). */
export const CONTRACTUAL_EQUITY_DELAY_MS = 15 * 60_000;

export type FeedEntitlement = "delayed" | "realtime" | "unknown" | "unavailable";

/** Where a real-time declaration stands. */
export type RealtimeState = "not_declared" | "declared_unverified" | "verified";

export interface FeedPolicy {
  entitlement: FeedEntitlement;
  /** The delay every observation from this feed carries, by contract. Unknown is treated as delayed. */
  contractualDelayMs: number;
  /** One line for a log or a trace. */
  basis: string;
}

/** Where `MARKET_DATA_REALTIME` stands; only "verified" lifts the delay. */
export function realtimeState(env: Record<string, string | undefined> = process.env): RealtimeState {
  if ((env.MARKET_DATA_REALTIME ?? "").trim().toLowerCase() !== "true") return "not_declared";
  const verifiedAt = Date.parse((env.MARKET_DATA_REALTIME_VERIFIED_AT ?? "").trim());
  return Number.isFinite(verifiedAt) ? "verified" : "declared_unverified";
}

/**
 * The feed policy for one instrument from one source, resolved on the server.
 * `isLive` false is the synthetic generator: no market behind it, so no delay
 * (and nothing actionable either: `syntheticDataRefusal` keeps it out of
 * production writes). Crypto comes real-time from its own feed. Any source
 * this module does not know is "unknown" and carries the equity delay, so an
 * unrecognised feed can never read as current.
 */
export function resolveFeedPolicy(args: {
  assetClass: AssetClass;
  isLive: boolean;
  /** The provider's name, e.g. "alpaca"; undefined for an unrecorded source. */
  source?: string;
  env?: Record<string, string | undefined>;
}): FeedPolicy {
  if (!args.isLive) return { entitlement: "unavailable", contractualDelayMs: 0, basis: "synthetic data, no market feed" };
  if (args.assetClass === "crypto") return { entitlement: "realtime", contractualDelayMs: 0, basis: "crypto feed, real-time" };
  const source = (args.source ?? "").toLowerCase();
  if (source !== "" && source !== "alpaca") {
    return { entitlement: "unknown", contractualDelayMs: CONTRACTUAL_EQUITY_DELAY_MS, basis: `unrecognised source "${source}", read as delayed` };
  }
  const state = realtimeState(args.env);
  if (state === "verified") return { entitlement: "realtime", contractualDelayMs: 0, basis: "real-time entitlement, verified" };
  return {
    entitlement: "delayed",
    contractualDelayMs: CONTRACTUAL_EQUITY_DELAY_MS,
    basis: state === "declared_unverified" ? "real-time declared but not verified, read as delayed" : "delayed equity feed (15 minutes)",
  };
}

/** A UTC instant for an ET wall-clock minute on an ET calendar date. Handles DST. */
export function etInstant(dateKey: string, minutesEt: number): Date {
  const probe = new Date(`${dateKey}T12:00:00Z`);
  const offset = etParts(probe).minutes - 12 * 60; // -240 (EDT) or -300 (EST)
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (minutesEt - offset) * 60_000);
}

const REGULAR_OPEN_MIN = 9 * 60 + 30;
const REGULAR_CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

/** The regular session's close on an ET date: 16:00, or 13:00 on an NYSE early close. */
export function sessionCloseAt(dateKey: string): Date {
  return etInstant(dateKey, isEarlyClose(dateKey) ? EARLY_CLOSE_MIN : REGULAR_CLOSE_MIN);
}

/**
 * When a bar closed. The provider stamps bars with their open; a bar is never
 * read as closed at its own timestamp. Intraday: open + interval, clipped to
 * the regular close when a bar opened inside the session runs past it (the
 * short final hour of an exchange-hour chart, an early-close day). A US equity
 * day bar closes at that day's session close (16:00 ET, 13:00 on an early
 * close); crypto's at its open + 24 hours. Null when the timestamp is invalid.
 */
export function barCloseAt(barOpen: string, timeframe: Timeframe, assetClass: AssetClass): Date | null {
  const open = Date.parse(barOpen);
  const interval = TF_INTERVAL_MS[timeframe];
  if (!Number.isFinite(open) || !(interval > 0)) return null;
  const raw = open + interval;
  if (assetClass === "crypto") return new Date(raw);
  if (timeframe === "1Day") return sessionCloseAt(etDateKey(new Date(open)));
  if (interval < TF_INTERVAL_MS["1Day"]) {
    const key = etDateKey(new Date(open));
    const openMin = etParts(new Date(open)).minutes;
    if (openMin >= REGULAR_OPEN_MIN) {
      const close = sessionCloseAt(key).getTime();
      if (open < close && raw > close) return new Date(close);
    }
  }
  return new Date(raw);
}

export interface Availability {
  /** The observation's close (a candle) or event time (a trade or quote). */
  observedAt: Date;
  /** observedAt + the feed's contractual delay. */
  modeledAvailableAt: Date;
  /** When GSPS received it, where recorded. */
  receivedAt: Date | null;
  /** max(modeled, received). */
  usableAt: Date;
}

/**
 * When one observation may enter a decision. `observedAt` is a candle's close
 * (`barCloseAt`), or a trade's or quote's own event time, never a candle's
 * open. Null for an invalid timestamp: such an observation is never usable.
 */
export function availability(observedAt: Date | string | null | undefined, delayMs: number, receivedAt?: Date | string | null): Availability | null {
  const observed = toMs(observedAt);
  if (observed == null || !(delayMs >= 0) || !Number.isFinite(delayMs)) return null;
  const modeled = observed + delayMs;
  const received = receivedAt == null ? null : toMs(receivedAt);
  if (receivedAt != null && received == null) return null;
  const usable = received == null ? modeled : Math.max(modeled, received);
  return {
    observedAt: new Date(observed),
    modeledAvailableAt: new Date(modeled),
    receivedAt: received == null ? null : new Date(received),
    usableAt: new Date(usable),
  };
}

/** True when the observation could have entered a decision made at `evaluatedAt`. */
export function usableBy(a: Availability | null, evaluatedAt: Date): boolean {
  return a != null && Number.isFinite(evaluatedAt.getTime()) && a.usableAt.getTime() <= evaluatedAt.getTime();
}

/**
 * The bars a decision made at `evaluatedAt` may read: completed bars whose
 * close plus the delay (and receipt, where recorded) is at or before it. A
 * still-forming bar is never among them (its close is after the clock). Bars
 * must be oldest first; order is kept.
 */
export function availableBars<T extends Bar>(
  bars: readonly T[],
  args: { timeframe: Timeframe; assetClass: AssetClass; delayMs: number; evaluatedAt: Date; receivedAt?: Date | null },
): T[] {
  const out: T[] = [];
  for (const b of bars) {
    const close = barCloseAt(b.t, args.timeframe, args.assetClass);
    if (usableBy(availability(close, args.delayMs, args.receivedAt ?? null), args.evaluatedAt)) out.push(b);
  }
  return out;
}

/** The newest usable bar's close, or null when none is usable. */
export function dataAsOf(bars: readonly Bar[], timeframe: Timeframe, assetClass: AssetClass): Date | null {
  const last = bars[bars.length - 1];
  return last ? barCloseAt(last.t, timeframe, assetClass) : null;
}

/**
 * How old an observation is at `now`, in milliseconds, or null when either
 * time is unknown or invalid. Unknown age is never read as zero.
 */
export function observationAgeMs(asOf: Date | string | null | undefined, now: Date): number | null {
  const at = toMs(asOf);
  const n = now.getTime();
  if (at == null || !Number.isFinite(n)) return null;
  return Math.max(0, n - at);
}

/**
 * Genuine stale-data protection under a real-time feed: an observation older
 * than one bar of the timeframe it is read on was not current when read. A
 * delayed feed is judged by its contract (`decisionLag`) instead.
 */
export function staleUnderRealtime(ageMs: number | null, timeframe: Timeframe): boolean {
  return ageMs == null || ageMs > TF_INTERVAL_MS[timeframe];
}

/**
 * The first bar an order made at `decisionAt` could fill on: the first whose
 * open is at or after the decision. A bar that opened before the decision is
 * never filled at its open (approximation, stated: on bars only, a decision
 * inside a bar waits for the next bar's open). -1 when none.
 */
export function firstExecutableBarIndex(bars: readonly Bar[], decisionAt: Date, from = 0): number {
  const at = decisionAt.getTime();
  if (!Number.isFinite(at)) return -1;
  for (let i = Math.max(0, from); i < bars.length; i++) {
    const open = Date.parse(bars[i].t);
    if (Number.isFinite(open) && open >= at) return i;
  }
  return -1;
}

/**
 * When the replay may decide on a closed bar: the bar's close plus the delay.
 * The decision is then filled on `firstExecutableBarIndex`. Under the 15-minute
 * delay on 15-minute bars that is two bars after the signal bar, not the next.
 */
export function replayDecisionAt(bar: Bar, timeframe: Timeframe, assetClass: AssetClass, delayMs: number): Date | null {
  const a = availability(barCloseAt(bar.t, timeframe, assetClass), delayMs);
  return a ? a.usableAt : null;
}

/** One trace line per decision (DATA-DELAY-001 §8), for tests and logs. */
export interface TimelinessTrace {
  symbol: string;
  barCloseAt: string | null;
  modeledAvailableAt: string | null;
  receivedAt: string | null;
  evaluatedAt: string;
  notifiedAt: string | null;
  earliestExecutableAt: string | null;
  filledAt: string | null;
  eligible: boolean;
  strategyVersion: string;
  rejection: string | null;
}

function toMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const ms = typeof v === "string" ? Date.parse(v) : v.getTime();
  return Number.isFinite(ms) ? ms : null;
}
