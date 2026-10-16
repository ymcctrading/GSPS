/**
 * One explainer per built-in Strategy Mode (see ./types.ts for what an
 * explainer may and may not do). Each reuses the formula its mode already
 * computes in `../math.ts`, so the reading and the mode can't disagree about
 * what the indicator says.
 */

import {
  bollinger,
  donchian,
  ema,
  macd,
  psar,
  rsi,
  sma,
  stochastic,
  supertrend,
  vwap,
  latestSession,
} from "../math";
import { evaluateSaraStrat } from "../saraStrat";
import { STRATEGY_MODE_LABELS, type StrategyDirection } from "../types";
import { OVERBOUGHT, OVERSOLD } from "../rsiReversal";
import {
  distanceWords,
  fixed,
  latestAtr,
  money,
  readEachLevel,
  reading,
  withHypotheticalClose,
} from "./common";
import type { PlanExplainer } from "./types";

function last<T>(series: (T | null)[]): T | null {
  return series.length ? series[series.length - 1] : null;
}

function lean(up: boolean | null): StrategyDirection | null {
  return up == null ? null : up ? "bullish" : "bearish";
}

export const explainPsarSupertrend: PlanExplainer = (bars, plan) => {
  const p = last(psar(bars));
  const s = last(supertrend(bars));
  if (!p || !s) return null;
  const split = p.trend !== s.trend;
  const dir = split ? null : lean(p.trend === "up");
  const flips = (
    price: number,
    line: { value: number; trend: "up" | "down" },
  ) => (line.trend === "up" ? price < line.value : price > line.value);
  return reading(
    "psarSupertrend",
    STRATEGY_MODE_LABELS.psarSupertrend,
    split
      ? `PSAR is trending ${p.trend} and Supertrend ${s.trend}, so they disagree.`
      : `PSAR and Supertrend are both trending ${p.trend}.`,
    dir,
    plan,
    readEachLevel(plan, (price) => {
      const changes = [
        flips(price, p) ? "PSAR" : null,
        flips(price, s) ? "Supertrend" : null,
      ].filter(Boolean);
      const where = `${price >= p.value ? "above" : "below"} the PSAR dot (${money(p.value)}) and ${
        price >= s.value ? "above" : "below"
      } the Supertrend line (${money(s.value)})`;
      return changes.length
        ? `${where}. A close here would flip ${changes.join(" and ")}.`
        : `${where}. A close here would flip neither.`;
    }),
  );
};

export const explainSaraStrat: PlanExplainer = (bars, plan) => {
  // The same pattern choice the mode itself makes, so the two can't differ.
  const armed = evaluateSaraStrat(bars);
  const label = STRATEGY_MODE_LABELS.saraStrat;
  if (!armed) {
    return {
      source: "saraStrat",
      label,
      agrees: null,
      summary: `No reversal bar pattern is armed on the latest bars, so ${label} has no reading.`,
      levels: [],
    };
  }
  const best = {
    direction: armed.direction,
    triggerPrice: armed.entry,
    stopPrice: armed.stopLoss,
  };
  const range = Math.abs(best.triggerPrice - best.stopPrice);
  return reading(
    "saraStrat",
    label,
    `The latest bar pattern points ${best.direction}, with its trigger at ${money(best.triggerPrice)} and its stop at ${money(best.stopPrice)}.`,
    best.direction,
    plan,
    readEachLevel(plan, (price, key) => {
      const ref = key === "stopLoss" ? best.stopPrice : best.triggerPrice;
      const refName =
        key === "stopLoss" ? "the pattern's stop" : "the pattern's trigger";
      const ranges =
        range > 0
          ? ` That is ${fixed(Math.abs(price - ref) / range)}× the pattern's own range.`
          : "";
      return `${distanceWords(price, ref, null)} ${refName} (${money(ref)}).${ranges}`;
    }),
  );
};

export const explainMaCrossover: PlanExplainer = (bars, plan) => {
  const fast = last(ema(bars, 9));
  const slow = last(sma(bars, 20));
  if (fast == null || slow == null) return null;
  const a = latestAtr(bars);
  return reading(
    "maCrossover",
    STRATEGY_MODE_LABELS.maCrossover,
    `EMA 9 (${money(fast)}) is ${fast >= slow ? "above" : "below"} SMA 20 (${money(slow)}).`,
    fast === slow ? null : lean(fast > slow),
    plan,
    readEachLevel(
      plan,
      (price) =>
        `${distanceWords(price, fast, a)} EMA 9 and ${distanceWords(price, slow, a)} SMA 20.`,
    ),
  );
};

export const explainBollinger: PlanExplainer = (bars, plan) => {
  const b = last(bollinger(bars, 20, 2));
  if (!b || b.upper <= b.lower) return null;
  const close = bars[bars.length - 1].c;
  const pctB = (price: number) =>
    ((price - b.lower) / (b.upper - b.lower)) * 100;
  return reading(
    "bollinger",
    STRATEGY_MODE_LABELS.bollinger,
    `The bands run ${money(b.lower)} to ${money(b.upper)} around a ${money(b.middle)} middle, and the last close sits at %B ${fixed(pctB(close), 0)}.`,
    close === b.middle ? null : lean(close > b.middle),
    plan,
    readEachLevel(plan, (price) => {
      const v = pctB(price);
      if (v > 100)
        return `above the upper band (%B ${fixed(v, 0)}), stretched by this technique's measure.`;
      if (v < 0)
        return `below the lower band (%B ${fixed(v, 0)}), stretched by this technique's measure.`;
      return `inside the bands at %B ${fixed(v, 0)}, ${v >= 50 ? "above" : "below"} the middle band.`;
    }),
  );
};

function rsiZone(v: number): string {
  if (v >= OVERBOUGHT) return "overbought";
  if (v <= OVERSOLD) return "oversold";
  return "neutral";
}

export const explainRsiReversal: PlanExplainer = (bars, plan) => {
  const now = last(rsi(bars, 14));
  if (now == null) return null;
  return reading(
    "rsiReversal",
    STRATEGY_MODE_LABELS.rsiReversal,
    `RSI 14 is ${fixed(now, 0)} (${rsiZone(now)}).`,
    now === 50 ? null : lean(now > 50),
    plan,
    readEachLevel(plan, (price) => {
      const v = last(rsi(withHypotheticalClose(bars, price), 14));
      return v == null
        ? "no RSI reading."
        : `a close here would put RSI 14 near ${fixed(v, 0)} (${rsiZone(v)}).`;
    }),
  );
};

export const explainMacdMomentum: PlanExplainer = (bars, plan) => {
  const now = last(macd(bars));
  if (!now) return null;
  return reading(
    "macdMomentum",
    STRATEGY_MODE_LABELS.macdMomentum,
    `The MACD line is ${now.macd >= now.signal ? "above" : "below"} its signal line (histogram ${fixed(now.histogram, 2)}).`,
    now.histogram === 0 ? null : lean(now.histogram > 0),
    plan,
    readEachLevel(plan, (price) => {
      const v = last(macd(withHypotheticalClose(bars, price)));
      if (!v) return "no MACD reading.";
      const side = v.histogram >= 0 ? "above" : "below";
      const flipped = v.histogram >= 0 !== now.histogram >= 0;
      return `a close here would leave the MACD line ${side} its signal line (histogram ${fixed(v.histogram, 2)})${
        flipped ? ", a crossover" : ""
      }.`;
    }),
  );
};

export const explainVwap: PlanExplainer = (bars, plan) => {
  const v = last(vwap(latestSession(bars)));
  if (v == null) return null;
  const close = bars[bars.length - 1].c;
  const a = latestAtr(bars);
  return reading(
    "vwap",
    STRATEGY_MODE_LABELS.vwap,
    `VWAP is ${money(v)} and the last close is ${distanceWords(close, v, a)} it.`,
    close === v ? null : lean(close > v),
    plan,
    readEachLevel(plan, (price) => `${distanceWords(price, v, a)} VWAP.`),
  );
};

function stochZone(k: number): string {
  if (k >= 80) return "overbought";
  if (k <= 20) return "oversold";
  return "neutral";
}

export const explainStochastic: PlanExplainer = (bars, plan) => {
  const now = last(stochastic(bars));
  if (!now) return null;
  return reading(
    "stochastic",
    STRATEGY_MODE_LABELS.stochastic,
    `%K is ${fixed(now.k, 0)} and %D is ${fixed(now.d, 0)} (${stochZone(now.k)}).`,
    now.k === now.d ? null : lean(now.k > now.d),
    plan,
    readEachLevel(plan, (price) => {
      const v = last(stochastic(withHypotheticalClose(bars, price)));
      return v == null
        ? "no stochastic reading."
        : `a close here would put %K near ${fixed(v.k, 0)} (${stochZone(v.k)}), ${v.k >= v.d ? "above" : "below"} %D.`;
    }),
  );
};

export const explainDonchian: PlanExplainer = (bars, plan) => {
  const c = last(donchian(bars, 20));
  if (!c || c.upper <= c.lower) return null;
  const close = bars[bars.length - 1].c;
  return reading(
    "donchian",
    STRATEGY_MODE_LABELS.donchian,
    `The 20-bar channel runs ${money(c.lower)} to ${money(c.upper)}.`,
    close === c.middle ? null : lean(close > c.middle),
    plan,
    readEachLevel(plan, (price) => {
      if (price > c.upper)
        return `above the channel high (${money(c.upper)}), a breakout by this technique's measure.`;
      if (price < c.lower)
        return `below the channel low (${money(c.lower)}), a breakdown by this technique's measure.`;
      const pos = ((price - c.lower) / (c.upper - c.lower)) * 100;
      return `inside the channel, ${fixed(pos, 0)}% of the way from its low to its high.`;
    }),
  );
};
