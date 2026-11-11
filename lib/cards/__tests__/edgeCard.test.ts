import { describe, expect, it } from "vitest";
import { edgeCardFor, edgePart, openEdgeCard, shownTargets, EDGE_CARD_CONFIG, EDGE_PARTS, EDGE_WARMUP_BARS } from "@/lib/cards/edgeCard";
import { prepare, ptsAt } from "@/lib/edgeEngine/pts";
import { nearestLevelAbove } from "@/lib/edgeEngine/trade";
import { cardLevels } from "@/lib/edgeEngine/card";
import { pricePoint } from "@/lib/gann/pointScale";
import type { Bar } from "@/lib/types";

/** Seeded random-walk daily bars on weekdays from 2021-01-04. */
function series(n: number, seed: number, p0: number): Bar[] {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Bar[] = [];
  let p = p0;
  const d = new Date(Date.UTC(2021, 0, 4));
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) {
      const o = p * (1 + (rnd() - 0.5) * 0.01);
      p = p * (1 + (rnd() - 0.49) * 0.04);
      const h = Math.max(o, p) * (1 + rnd() * 0.01);
      const l = Math.min(o, p) * (1 - rnd() * 0.01);
      out.push({ t: d.toISOString().slice(0, 10), o, h, l, c: p, v: 1_000_000 });
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** The scoring script's own selection loop (private-research gc/ee-gc3.mjs), on the whole series. */
function scoredEvents(bars: Bar[]) {
  const cfg = EDGE_CARD_CONFIG;
  const P = prepare("SYN", bars, cfg, null);
  const ev: { t: number; fill: number }[] = [];
  let busy = -1;
  for (let t = EDGE_WARMUP_BARS; t < bars.length; t++) {
    if (t <= busy || !ptsAt(P, t, "bottom", cfg)) continue;
    let lowest = t, fill = -1, px = 0;
    const end = Math.min(bars.length - 1, t + cfg.confirmBars);
    for (let i = t; i <= end; i++) {
      if (bars[i].l < bars[lowest].l) lowest = i;
      if (i > lowest && bars[i].h > bars[lowest].h) { fill = i; px = Math.max(bars[i].o, bars[lowest].h); break; }
    }
    ev.push({ t, fill });
    if (fill < 0) { busy = end; continue; }
    const stop = bars[lowest].l - pricePoint(bars[lowest].l);
    const tp = nearestLevelAbove(P, fill, px);
    if (tp === null || px <= stop) { busy = fill; continue; }
    let k = fill;
    while (k < bars.length && !(bars[k].l <= stop || bars[k].h >= tp)) k++;
    busy = k;
  }
  return { P, ev };
}

describe("openEdgeCard", () => {
  it("offers, on bars through each night only, exactly the card the scoring held open that night", () => {
    const bars = series(700, 7, 80);
    const { P, ev } = scoredEvents(bars);
    let offered = 0;
    for (let asOf = 400; asOf < bars.length - 1; asOf += 3) {
      const want = ev.find((e) => e.t <= asOf && asOf < e.t + EDGE_CARD_CONFIG.confirmBars && (e.fill < 0 || e.fill > asOf));
      const got = openEdgeCard(prepare("SYN", bars.slice(0, asOf + 1), EDGE_CARD_CONFIG, null));
      if (!want) {
        expect(got, `night ${asOf}`).toBeNull();
        continue;
      }
      const wantL = cardLevels(P, want.t, asOf, EDGE_CARD_CONFIG);
      if (!wantL) {
        expect(got).toBeNull();
        continue;
      }
      offered++;
      expect(got).toEqual({ ...wantL, eventIndex: want.t });
      expect(got!.tp1).toBeGreaterThan(got!.entry);
      expect(got!.stop).toBeLessThan(got!.entry);
      expect(got!.mtp).toBeGreaterThanOrEqual(got!.entry + 3 * (got!.entry - got!.stop) - 1e-9);
    }
    expect(offered).toBeGreaterThan(0);
  }, 120_000);

  it("gives no card on too short a history", () => {
    expect(edgeCardFor("SYN", series(EDGE_WARMUP_BARS, 3, 50))).toBeNull();
  });
});

describe("shownTargets", () => {
  it("shows one target when the nearest level is already past 3R", () => {
    expect(shownTargets({ tp1: 120, tp2: null, mtp: 120 })).toEqual({ tp1: 120, tp2: null, mtp: null });
    expect(shownTargets({ tp1: 101, tp2: 104, mtp: 112 })).toEqual({ tp1: 101, tp2: 104, mtp: 112 });
    expect(shownTargets({ tp1: 101, tp2: null, mtp: 112 })).toEqual({ tp1: 101, tp2: null, mtp: 112 });
  });
});

describe("edgePart", () => {
  it("splits the universe into parts that cover every symbol once", () => {
    const syms = Array.from({ length: 50 }, (_, i) => `S${i}`);
    const parts = Array.from({ length: EDGE_PARTS }, (_, k) => edgePart(syms, k));
    expect(parts.flat().sort()).toEqual([...syms].sort());
    expect(Math.max(...parts.map((p) => p.length)) - Math.min(...parts.map((p) => p.length))).toBeLessThanOrEqual(1);
  });
});
