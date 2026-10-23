/**
 * /api/settings/chart-indicators (merge-side review of #478, B1): `prefs` is
 * shared with the trade style history the exit managers read, Guided Mode and
 * onboarding, so a PUT merges into what it read, keeps the preset cap, and
 * writes nothing when the read failed.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_INDICATOR_PARAMS,
  MAX_PRESETS,
  applyChartIndicatorChange,
  type ChartPreset,
} from "../indicatorParams";

const db = vi.hoisted(() => ({
  read: { data: null as unknown, error: null as unknown },
  upsert: vi.fn<(row: unknown, opts?: unknown) => Promise<{ error: null }>>(async () => ({ error: null })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => db.read }) }),
      upsert: db.upsert,
    }),
  }),
}));

import { GET, PUT } from "@/app/api/settings/chart-indicators/route";

const otherPrefs = {
  gannRules: { tradeStyle: "fast", tradeStyleHistory: [{ style: "fast", from: "2026-10-20T00:00:00Z" }] },
  guided: { seen: true },
  onboarding: { done: true },
};

function preset(name: string): ChartPreset {
  return { name, overlays: ["sma20"], studies: [], params: DEFAULT_INDICATOR_PARAMS };
}

function put(body: unknown) {
  return PUT(new Request("http://x/api/settings/chart-indicators", { method: "PUT", body: JSON.stringify(body) }) as never);
}

beforeEach(() => {
  db.read = { data: { prefs: otherPrefs }, error: null };
  db.upsert.mockClear();
});

describe("applyChartIndicatorChange", () => {
  it("keeps every other prefs key", () => {
    const params = { ...DEFAULT_INDICATOR_PARAMS, sma20: { period: 200 } };
    const r = applyChartIndicatorChange(otherPrefs, { params });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prefs.gannRules).toEqual(otherPrefs.gannRules);
    expect(r.prefs.guided).toEqual(otherPrefs.guided);
    expect(r.prefs.onboarding).toEqual(otherPrefs.onboarding);
    expect(r.chartIndicators.params.sma20.period).toBe(200);
  });

  it("refuses a new preset past the cap but replaces one by name", () => {
    const full = { chartIndicators: { params: DEFAULT_INDICATOR_PARAMS, presets: Array.from({ length: MAX_PRESETS }, (_, i) => preset(`p${i}`)) } };
    expect(applyChartIndicatorChange(full, { savePreset: preset("new") }).ok).toBe(false);
    const replaced = applyChartIndicatorChange(full, { savePreset: preset("P3") });
    expect(replaced.ok && replaced.chartIndicators.presets.length).toBe(MAX_PRESETS);
  });

  it("refuses a MACD whose fast period is not under its slow one", () => {
    const params = { ...DEFAULT_INDICATOR_PARAMS, macd: { fast: 26, slow: 12, signal: 9 } };
    expect(applyChartIndicatorChange(otherPrefs, { params }).ok).toBe(false);
  });
});

describe("PUT /api/settings/chart-indicators", () => {
  it("merges into the prefs it read", async () => {
    const res = await put({ deletePreset: "none" });
    expect(res.status).toBe(200);
    const row = db.upsert.mock.calls[0][0] as { prefs: Record<string, unknown> };
    expect(row.prefs.gannRules).toEqual(otherPrefs.gannRules);
    expect(row.prefs.guided).toEqual(otherPrefs.guided);
  });

  it("answers 502 and writes nothing when the read fails", async () => {
    db.read = { data: null, error: { message: "timeout" } };
    const res = await put({ deletePreset: "none" });
    expect(res.status).toBe(502);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("GET answers 502 when the read fails", async () => {
    db.read = { data: null, error: { message: "timeout" } };
    expect((await GET()).status).toBe(502);
  });
});
