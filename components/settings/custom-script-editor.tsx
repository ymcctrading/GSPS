"use client";

/**
 * Custom-script Strategy Modes — authoring UI
 * (AGENTS.md's "Strategy Modes" section, `docs/STRATEGY_MODES.md`'s
 * "Custom-script / plugin system"). This is the UI surface Phase 2's CRUD
 * API, Phase 3's chart/level hook, and Phase 4's backtester never had one
 * — everything here is a thin client over `/api/strategy-plugins*`, which
 * already does every real check (tier gate, compile-before-persist,
 * private-to-author scoping via RLS + `user_id` filters). This component
 * computes nothing of its own and trusts nothing it hasn't fetched from
 * those routes — including whether the signed-in account may author at
 * all (`authoringEnabled`, resolved server-side).
 *
 * Three-question framing (AGENTS.md's Three-question mandate), for this
 * UI surface specifically:
 * 1. Gann sourcing: not applicable — pure interface work, no technique of
 *    its own to cite (same carve-out the mandate's own scope note allows).
 * 2. Cycle theory: not applicable to the mechanism itself.
 * 3. Hermetic principle: Polarity, the same framing
 *    `docs/STRATEGY_MODES.md`'s "Custom-script / plugin system" section
 *    already gives the system as a whole — this page is where the
 *    "expert" pole of that novice/expert spectrum actually authors their
 *    own method, gated to the one tier trusted with it.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd, cn } from "@/lib/utils";
import { TIMEFRAMES, TF_CANDLE_LABEL } from "@/lib/timeframe";
import type { Timeframe } from "@/lib/types";
import type { CustomScriptLevels } from "@/lib/strategies/custom/types";

interface PluginSummary {
  id: string;
  name: string;
  author: string;
  version: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface PluginDetail extends PluginSummary {
  source: string;
}

interface VersionRow {
  version: number;
  source: string;
  created_at: string;
}

type Mode = "list" | "new" | { id: string };

const DSL_EXAMPLE = `rule bullish when crossesAbove(ema(9), sma(20)) {
  entry = high[0] * 1.0005
  stop = lowest(low, 10)
  tp1r = 2
  mtpr = 4
}

rule bearish when crossesBelow(ema(9), sma(20)) {
  entry = low[0] * 0.9995
  stop = highest(high, 10)
}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export function CustomScriptEditor() {
  const [authoringEnabled, setAuthoringEnabled] = useState<boolean | null>(null);
  const [scripts, setScripts] = useState<PluginSummary[]>([]);
  const [mode, setMode] = useState<Mode>("list");

  const [detail, setDetail] = useState<PluginDetail | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [compileErrors, setCompileErrors] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [source, setSource] = useState(DSL_EXAMPLE);
  const [active, setActive] = useState(true);

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [saveErrorDetails, setSaveErrorDetails] = useState<string[]>([]);

  const [symbol, setSymbol] = useState("");
  const [checkStatus, setCheckStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [checkError, setCheckError] = useState("");
  const [checkLevels, setCheckLevels] = useState<CustomScriptLevels | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>("5Min");
  const [backtestStatus, setBacktestStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [backtestError, setBacktestError] = useState("");
  const [backtestResult, setBacktestResult] = useState<{
    barsEvaluated: number;
    armedCount: number;
    bullishCount: number;
    bearishCount: number;
    events: { index: number; date: string; direction: string; entry: number; stopLoss: number }[];
  } | null>(null);

  const loadList = useCallback(() => {
    fetch("/api/strategy-plugins")
      .then((res) => res.json())
      .then((body: { plugins?: PluginSummary[]; authoringEnabled?: boolean }) => {
        setAuthoringEnabled(body.authoringEnabled ?? false);
        setScripts(body.plugins ?? []);
      })
      .catch(() => setAuthoringEnabled(false));
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function resetTestPanels() {
    setSymbol("");
    setCheckStatus("idle");
    setCheckError("");
    setCheckLevels(null);
    setBacktestStatus("idle");
    setBacktestError("");
    setBacktestResult(null);
  }

  function startNew() {
    setMode("new");
    setDetail(null);
    setVersions([]);
    setCompileErrors([]);
    setName("");
    setSource(DSL_EXAMPLE);
    setActive(true);
    setSaveStatus("idle");
    setSaveError("");
    setSaveErrorDetails([]);
    resetTestPanels();
  }

  function select(id: string) {
    setMode({ id });
    setSaveStatus("idle");
    setSaveError("");
    setSaveErrorDetails([]);
    resetTestPanels();
    fetch(`/api/strategy-plugins/${id}`)
      .then((res) => res.json())
      .then((body: { plugin?: PluginDetail; versions?: VersionRow[]; compiles?: boolean; compileErrors?: string[] }) => {
        if (!body.plugin) return;
        setDetail(body.plugin);
        setVersions(body.versions ?? []);
        setCompileErrors(body.compiles === false ? body.compileErrors ?? [] : []);
        setName(body.plugin.name);
        setSource(body.plugin.source);
        setActive(body.plugin.active);
      });
  }

  async function save() {
    setSaveStatus("saving");
    setSaveError("");
    setSaveErrorDetails([]);
    try {
      const isNew = mode === "new";
      const res = await fetch(isNew ? "/api/strategy-plugins" : `/api/strategy-plugins/${(mode as { id: string }).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? { name, source } : { name, source, active }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setSaveError((body.error as string) ?? "Couldn't save.");
        setSaveErrorDetails((body.details as string[]) ?? []);
        setSaveStatus("error");
        return;
      }
      setSaveStatus("idle");
      loadList();
      const savedId = ((body.plugin as { id: string } | undefined)?.id) ?? (mode as { id: string } | undefined)?.id;
      if (savedId) select(savedId);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveStatus("error");
    }
  }

  async function remove() {
    if (mode === "list" || mode === "new") return;
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    const res = await fetch(`/api/strategy-plugins/${mode.id}`, { method: "DELETE" });
    if (res.ok) {
      setMode("list");
      setDetail(null);
      loadList();
    }
  }

  async function checkLevelsNow() {
    if (mode === "list" || mode === "new" || !symbol) return;
    setCheckStatus("loading");
    setCheckError("");
    try {
      const res = await fetch(
        `/api/strategy-plugins/${mode.id}/evaluate?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
      );
      const body = await readJson(res);
      if (!res.ok) throw new Error((body.error as string) ?? "Couldn't check levels.");
      setCheckLevels((body.levels as CustomScriptLevels | null) ?? null);
      setCheckStatus("ready");
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
      setCheckStatus("error");
    }
  }

  async function runBacktest() {
    if (mode === "list" || mode === "new" || !symbol) return;
    setBacktestStatus("loading");
    setBacktestError("");
    try {
      const res = await fetch(
        `/api/strategy-plugins/${mode.id}/backtest?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`,
      );
      const body = await readJson(res);
      if (!res.ok) throw new Error((body.error as string) ?? "Couldn't run backtest.");
      setBacktestResult(
        body as unknown as {
          barsEvaluated: number;
          armedCount: number;
          bullishCount: number;
          bearishCount: number;
          events: { index: number; date: string; direction: string; entry: number; stopLoss: number }[];
        },
      );
      setBacktestStatus("ready");
    } catch (err) {
      setBacktestError(err instanceof Error ? err.message : String(err));
      setBacktestStatus("error");
    }
  }

  if (authoringEnabled === null) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (!authoringEnabled) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted">
            Custom-script authoring isn&apos;t included on your plan.
          </p>
        </CardContent>
      </Card>
    );
  }

  const editing = mode !== "list" && mode !== "new" ? mode.id : mode === "new" ? "new" : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Your scripts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={startNew}>
            + New script
          </Button>
          {scripts.length === 0 && <p className="text-xs text-muted">No saved scripts yet.</p>}
          {scripts.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              className={cn(
                "flex min-h-11 flex-col items-start rounded-md border px-2.5 py-1.5 text-left text-sm hover:bg-background",
                editing === s.id ? "border-accent bg-accent-soft" : "border-border",
              )}
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-muted">
                v{s.version} · {s.active ? "active" : <Badge variant="muted">inactive</Badge>}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      {mode === "list" ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted">
              Select a script on the left, or start a new one. A script is a small set of
              condition/action rules — see the example below for the shape.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-surface-alt p-3 text-xs">{DSL_EXAMPLE}</pre>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{mode === "new" ? "New script" : "Edit script"}</CardTitle>
              <CardDescription>
                Condition/action rules only — comparisons, crossovers, and the same indicators
                (`sma`, `ema`, `rsi`, `atr`, `vwap`, `macd`, `bollinger`, `psar`, `supertrend`,
                `stochastic`) and swing helpers (`lowest`, `highest`) the built-in Strategy Modes
                use. A saved script is private to your account and never touches GSPS&apos;s own
                verdict — see the &quot;Custom scripts&quot; card on Settings for the full
                explanation.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Name
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted">
                Rules
                <textarea
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="w-full rounded-lg border border-border bg-surface p-3 font-mono text-xs focus-visible:outline-2 focus-visible:outline-accent"
                />
              </label>

              {typeof mode !== "string" && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active (selectable on the chart / order ticket)
                </label>
              )}

              {compileErrors.length > 0 && saveStatus === "idle" && (
                <div className="rounded-md bg-warn-soft p-2 text-xs text-warn">
                  This saved version no longer compiles:
                  <ul className="ml-4 list-disc">
                    {compileErrors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {saveStatus === "error" && (
                <div className="rounded-md bg-warn-soft p-2 text-xs text-warn">
                  {saveError}
                  {saveErrorDetails.length > 0 && (
                    <ul className="ml-4 list-disc">
                      {saveErrorDetails.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={saveStatus === "saving" || !name || !source} onClick={save}>
                  {saveStatus === "saving" ? "Saving…" : "Save"}
                </Button>
                {typeof mode !== "string" && (
                  <Button size="sm" variant="destructive" onClick={remove}>
                    Delete
                  </Button>
                )}
                {detail && <span className="text-xs text-muted">Current version: v{detail.version}</span>}
              </div>

              {versions.length > 1 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Version history ({versions.length})</summary>
                  <ul className="mt-1 ml-4 list-disc">
                    {versions.map((v) => (
                      <li key={v.version}>
                        v{v.version} — {new Date(v.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          {typeof mode !== "string" && (
            <Card>
              <CardHeader>
                <CardTitle>Try it against a symbol</CardTitle>
                <CardDescription>
                  Save your changes first — these run the currently saved version, not unsaved
                  edits above.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Symbol
                    <Input
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                      placeholder="AAPL"
                      className="w-28"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Timeframe
                    <select
                      className="h-10 rounded-lg border border-border bg-surface px-2 text-sm"
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value as Timeframe)}
                    >
                      {TIMEFRAMES.map((tf) => (
                        <option key={tf} value={tf}>
                          {TF_CANDLE_LABEL[tf]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button size="sm" variant="outline" disabled={!symbol || checkStatus === "loading"} onClick={checkLevelsNow}>
                    {checkStatus === "loading" ? "Checking…" : "Check levels"}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!symbol || backtestStatus === "loading"} onClick={runBacktest}>
                    {backtestStatus === "loading" ? "Running…" : "Run backtest"}
                  </Button>
                </div>

                {checkStatus === "error" && <p className="text-xs text-warn">{checkError}</p>}
                {checkStatus === "ready" && !checkLevels && (
                  <p className="text-xs text-muted">Nothing currently armed under this script.</p>
                )}
                {checkLevels && (
                  <div className="rounded-md bg-surface-alt p-2 text-xs">
                    <p className="text-muted">{checkLevels.rationale}</p>
                    <p className="mt-1">
                      Entry {formatUsd(checkLevels.entry)} · Stop {formatUsd(checkLevels.stopLoss)} · TP1{" "}
                      {formatUsd(checkLevels.takeProfit1)} · Master target{" "}
                      {formatUsd(checkLevels.masterTarget)}
                    </p>
                  </div>
                )}

                {backtestStatus === "error" && <p className="text-xs text-warn">{backtestError}</p>}
                {backtestResult && (
                  <div className="rounded-md bg-surface-alt p-2 text-xs">
                    <p className="text-muted">
                      Evidence only, not a performance claim — no fill or stop/target-touch
                      simulation. This shows how often, in which direction, and at what prices the
                      script would have armed; it says nothing about what would have happened next.
                    </p>
                    <p className="mt-1">
                      {backtestResult.barsEvaluated} bars evaluated · armed {backtestResult.armedCount}{" "}
                      times ({backtestResult.bullishCount} bullish / {backtestResult.bearishCount}{" "}
                      bearish)
                    </p>
                    {backtestResult.events.length > 0 && (
                      <table className="mt-2 w-full text-left">
                        <thead className="text-muted">
                          <tr>
                            <th className="pr-2">Date</th>
                            <th className="pr-2">Dir</th>
                            <th className="pr-2">Entry</th>
                            <th>Stop</th>
                          </tr>
                        </thead>
                        <tbody>
                          {backtestResult.events.slice(0, 10).map((e, i) => (
                            <tr key={i}>
                              <td className="pr-2">{new Date(e.date).toLocaleDateString()}</td>
                              <td className="pr-2">{e.direction}</td>
                              <td className="pr-2">{formatUsd(e.entry)}</td>
                              <td>{formatUsd(e.stopLoss)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {backtestResult.events.length > 10 && (
                      <p className="mt-1 text-muted">
                        Showing the first 10 of {backtestResult.events.length} events.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
