"use client";

/**
 * A lesson's live examples, drawn from the learner's own charts
 * (/api/school/examples, lib/school/examples.ts): each one the most recent
 * stretch among their markets that shows the lesson's idea, on completed
 * daily bars, labelled as a past move. Before the learner has picked their
 * markets, the picker shows here instead, so the first lesson that needs a
 * chart asks for them.
 */

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type Time,
  type SeriesMarker,
} from "lightweight-charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SchoolPicksPicker, useSchoolPicks } from "@/components/school/school-picks";
import type { Bar } from "@/lib/types";

interface ShownExample {
  kind: string;
  title: string;
  symbol: string;
  standIn: boolean;
  caption: string;
  bars: Bar[];
  points: { t: string; price: number; text: string; position: "above" | "below" }[];
  lines: { price: number; label: string }[];
}

type ExampleRow = ShownExample | { kind: string; title: string; none: true };

interface ExamplesResponse {
  needsPicks: boolean;
  examples: ExampleRow[];
  noCharts?: string[];
  shortHistory?: string[];
}

const UP = "#059669";
const DOWN = "#dc2626";
const MARK = "#8b5cf6";

const toTime = (t: string) => (Math.floor(Date.parse(t) / 1000) as Time);

function ExampleChart({ example }: { example: ShownExample }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const styles = getComputedStyle(document.documentElement);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: styles.getPropertyValue("--muted").trim() || "#64748b",
        attributionLogo: false,
      },
      grid: { vertLines: { color: "rgba(148,163,184,0.12)" }, horzLines: { color: "rgba(148,163,184,0.12)" } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderVisible: false,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    series.setData(example.bars.map((b) => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    for (const line of example.lines) {
      series.createPriceLine({ price: line.price, color: MARK, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: line.label });
    }
    const markers: SeriesMarker<Time>[] = example.points
      .map((p) => ({
        time: toTime(p.t),
        position: p.position === "above" ? ("aboveBar" as const) : ("belowBar" as const),
        color: MARK,
        shape: p.position === "above" ? ("arrowDown" as const) : ("arrowUp" as const),
        text: p.text,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
    createSeriesMarkers(series, markers);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [example]);
  return <div ref={ref} className="h-64 w-full" />;
}

export function LessonExamples({ lessonId }: { lessonId: string }) {
  const [data, setData] = useState<ExamplesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const picks = useSchoolPicks();

  function load() {
    setFailed(false);
    fetch(`/api/school/examples?lesson=${encodeURIComponent(lessonId)}`)
      .then(async (res) => {
        if (!res.ok) return setFailed(true);
        setData((await res.json()) as ExamplesResponse);
      })
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    let live = true;
    fetch(`/api/school/examples?lesson=${encodeURIComponent(lessonId)}`)
      .then(async (res) => {
        if (!live) return;
        if (!res.ok) return setFailed(true);
        const json = (await res.json()) as ExamplesResponse;
        if (live) setData(json);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [lessonId]);

  if (failed) return null;
  if (!data) return null;

  if (data.needsPicks) {
    if (picks.state !== "ready" || !picks.data) return null;
    return (
      <SchoolPicksPicker
        config={picks.data}
        onSaved={(saved) => {
          picks.setData({ ...picks.data!, picks: saved });
          setData(null);
          load();
        }}
      />
    );
  }

  if (data.examples.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>On your charts</CardTitle>
        <CardDescription>
          The most recent example from the markets you follow, on completed daily bars. A past move, shown to learn
          from, not a forecast or a suggestion to trade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {data.examples.map((ex) =>
          "none" in ex ? (
            <div key={ex.kind} className="space-y-1">
              <h3 className="text-sm font-semibold">{ex.title}</h3>
              <p className="text-sm text-muted">
                None of your markets, or the broad market, shows one in the last few years of data.
              </p>
            </div>
          ) : (
            <div key={ex.kind} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {ex.title}: {ex.symbol}
              </h3>
              {ex.standIn && (
                <p className="text-xs text-muted">
                  None of your markets has one in the data we hold, so this is {ex.symbol}, the broad US market,
                  standing in.
                </p>
              )}
              <ExampleChart example={ex} />
              <p className="text-sm">{ex.caption}</p>
            </div>
          ),
        )}
        {data.noCharts && data.noCharts.length > 0 && (
          <p className="text-xs text-muted">
            {data.noCharts.join(", ")}: GSPS doesn&apos;t hold daily charts for futures or currencies yet, so these
            don&apos;t supply examples for now.
          </p>
        )}
        {data.shortHistory && data.shortHistory.length > 0 && (
          <p className="text-xs text-muted">
            {data.shortHistory.join(", ")}: less than a year of history, so some examples come from your other markets.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
