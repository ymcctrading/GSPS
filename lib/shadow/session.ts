/**
 * The New York session a forward-test signal trades, and whether it is over.
 * Shared by the recorder and the evaluator (lib/shadow/record.ts, evaluate.ts).
 */

import { isCryptoSymbol } from "@/lib/market/cryptoSymbol";
import { etDateKey, etParts } from "@/lib/market/session";
import { isEarlyClose, isTradingDay } from "@/lib/market/calendar";

/** 4:00 PM and an early close's 1:00 PM, New York time, in minutes since midnight. */
const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;

/**
 * The New York session a signal trades. Gann chose his active stocks from the
 * completed daily charts the night before and timed them in the next session
 * (Master Course Ch. 13; AGENTS.md, "This covers how the platform runs"), and
 * a plan lasts its session (Q17). So a signal recorded before the
 * close trades that day's session (a pre-market scan included), and one
 * recorded after the close, on a weekend or on a market holiday trades the
 * next trading session. Crypto never closes: it trades the New York day it was
 * recorded in, from the scan on.
 */
export function shadowTradeSession(scannedAt: string, symbol: string): string {
  const at = new Date(scannedAt);
  const today = etDateKey(at);
  if (isCryptoSymbol(symbol)) return today;
  const close = isEarlyClose(today) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  if (isTradingDay(at) && etParts(at).minutes < close) return today;
  // Noon UTC is the same New York date whatever the season.
  const cursor = new Date(`${today}T12:00:00Z`);
  for (let i = 0; i < 10; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isTradingDay(cursor)) return etDateKey(cursor);
  }
  return etDateKey(cursor);
}

/**
 * Whether the session a signal trades is over: an earlier New York day, or
 * today once a US equity's session has closed (1:00 PM on an early close, and
 * all day on a weekend or holiday). Crypto's day is over only when the New
 * York day is.
 */
export function shadowSessionComplete(sessionDate: string, symbol: string, now: Date): boolean {
  const today = etDateKey(now);
  if (sessionDate !== today) return sessionDate < today;
  if (isCryptoSymbol(symbol)) return false;
  const close = isEarlyClose(today) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
  return !isTradingDay(now) || etParts(now).minutes >= close;
}

