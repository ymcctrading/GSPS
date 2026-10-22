"use client";

/**
 * The alert editor: pick what to watch (Last, Bid, Ask, Mark, the completed
 * close, net or % change, the day's high or low, volume), how it compares
 * (>=, <=, >, <) and the threshold, or take the threshold from a level on the
 * chart. Rules, Gann sources and citations: `lib/alerts/rules.ts`. Stored by
 * /api/price-alerts (origin "editor") and checked by the sweep, which puts a
 * fired alert on the bell and sends push and email by the member's settings.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import {
  ALERT_COMPARATORS,
  ALERT_FIELDS,
  ALERT_NOTE_MAX,
  FIELD_HELP,
  FIELD_LABELS,
  PRICE_FIELDS,
  closeBeyondThreshold,
  compareAlert,
  comparatorOf,
  describeAlertRule,
  formatThreshold,
  levelSources,
  readAlertField,
  roundThreshold,
  thresholdProblem,
  thresholdStep,
  type AlertComparator,
  type AlertExpiry,
  type AlertField,
  type AlertQuote,
  type ChartLevel,
  type StoredAlert,
} from "@/lib/alerts/rules";
import { cn, parseJsonResponse } from "@/lib/utils";

const SELECT = "h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm sm:w-56";

export function AlertEditor({
  open,
  onClose,
  symbol,
  chartLevels,
  fallbackPrice,
  onAlertsChanged,
}: {
  open: boolean;
  onClose: () => void;
  symbol: string;
  /** The plan and Gann lines the chart draws, offered as threshold sources. */
  chartLevels: ChartLevel[];
  /** The chart's last close, used until the live quote arrives. */
  fallbackPrice: number | null;
  onAlertsChanged?: (alerts: StoredAlert[]) => void;
}) {
  const sym = symbol.toUpperCase();
  const live = useLiveQuote(open ? sym : null);
  const quote: AlertQuote | null = useMemo(() => {
    if (live?.alertQuote) return live.alertQuote;
    const last = live?.price ?? fallbackPrice;
    if (last == null) return null;
    return { last, bid: null, ask: null, dayHigh: null, dayLow: null, dayVolume: null, completedClose: null, changeFrom: live?.prevClose ?? null };
  }, [live, fallbackPrice]);
  const last = quote?.last ?? fallbackPrice ?? null;

  const [field, setField] = useState<AlertField>("last");
  const [comparator, setComparator] = useState<AlertComparator>(">=");
  const [thresholdText, setThresholdText] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [closeBeyond, setCloseBeyond] = useState(false);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState<AlertExpiry>("gtc");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [alerts, setAlerts] = useState<StoredAlert[]>([]);

  const sources = useMemo(() => (last != null ? levelSources(last, chartLevels) : []), [last, chartLevels]);
  const source = sources.find((s) => s.id === sourceId) ?? null;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/price-alerts?symbol=${encodeURIComponent(sym)}`);
      const body = await parseJsonResponse<{ alerts?: StoredAlert[]; error?: string }>(res);
      if (!res.ok) throw new Error(body.error ?? "Couldn't load your alerts.");
      const rows = body.alerts ?? [];
      setAlerts(rows);
      onAlertsChanged?.(rows);
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }, [sym, onAlertsChanged]);

  useEffect(() => {
    // Loading the list is the effect's job: it reads the server when the
    // editor opens or the symbol changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void load();
  }, [open, load]);

  // Seed the threshold with the field's current value, as a broker's editor does.
  const seed = useCallback(
    (f: AlertField) => {
      const v = quote ? readAlertField(f, quote) : null;
      setThresholdText(v != null ? String(roundThreshold(f, v)) : "");
    },
    [quote],
  );
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && thresholdText === "" && quote) seed(field);
  }, [open, quote, field, seed, thresholdText]);

  function chooseField(f: AlertField) {
    setField(f);
    setCloseBeyond(false);
    if (source && PRICE_FIELDS.has(f)) setThresholdText(String(source.threshold));
    else {
      setSourceId("");
      seed(f);
    }
  }

  function chooseSource(id: string) {
    setSourceId(id);
    const s = sources.find((x) => x.id === id);
    if (!s) return;
    setComparator(s.comparator);
    if (closeBeyond) {
      setThresholdText(String(closeBeyondThreshold(s.level, s.comparator)));
    } else {
      if (!PRICE_FIELDS.has(field)) setField("last");
      setThresholdText(String(s.threshold));
    }
  }

  function toggleCloseBeyond(on: boolean) {
    setCloseBeyond(on);
    if (!source) return;
    if (on) {
      setField("close");
      setThresholdText(String(closeBeyondThreshold(source.level, comparator)));
    } else {
      setField("last");
      setThresholdText(String(source.threshold));
    }
  }

  function chooseComparator(c: AlertComparator) {
    setComparator(c);
    if (source && closeBeyond) setThresholdText(String(closeBeyondThreshold(source.level, c)));
  }

  const threshold = Number(thresholdText);
  const problem = thresholdText.trim() === "" ? "Enter a threshold." : thresholdProblem(field, threshold);
  const current = quote ? readAlertField(field, quote) : null;
  const alreadyTrue = problem == null && current != null && compareAlert(comparator, current, threshold);

  function step(sign: 1 | -1) {
    const base = Number.isFinite(threshold) && thresholdText.trim() !== "" ? threshold : (current ?? 0);
    const next = roundThreshold(field, base + sign * thresholdStep(field, current ?? base));
    setThresholdText(String(next));
  }

  async function create() {
    if (problem) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym,
          field,
          comparator,
          threshold,
          levelSource: source ? `${source.label}${closeBeyond ? ", close 3 points beyond" : ""}` : null,
          note: note.trim() || null,
          expiry,
        }),
      });
      const body = await parseJsonResponse<{ error?: string }>(res);
      if (!res.ok) throw new Error(body.error ?? "The alert wasn't saved.");
      setMessage({ tone: "ok", text: `Alert set: ${describeAlertRule({ symbol: sym, field, comparator, threshold })}.` });
      setNote("");
      await load();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/price-alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setMessage({ tone: "error", text: "That alert wasn't removed. Try again." });
      return;
    }
    await load();
  }

  const quoteCells: { label: string; value: string }[] = [
    { label: "Last", value: quote?.last != null ? formatThreshold("last", quote.last) : "—" },
    { label: "Net chg", value: quote && readAlertField("net_change", quote) != null ? formatThreshold("net_change", readAlertField("net_change", quote)!) : "—" },
    { label: "Bid", value: quote?.bid != null ? formatThreshold("bid", quote.bid) : "—" },
    { label: "Ask", value: quote?.ask != null ? formatThreshold("ask", quote.ask) : "—" },
    { label: "Mark", value: quote && readAlertField("mark", quote) != null ? formatThreshold("mark", readAlertField("mark", quote)!) : "—" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alert editor"
      description={sym}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? "Less" : "More"}
          </Button>
          <Button className="flex-1" disabled={saving || problem != null} onClick={create}>
            {saving ? "Saving…" : "Create alert"}
          </Button>
        </div>
      }
    >
      <dl className="grid grid-cols-5 gap-1 text-center text-xs">
        {quoteCells.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="text-muted">{c.label}</dt>
            <dd className="truncate font-medium tabular-nums">{c.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-col divide-y divide-border">
        <Row label="Alert">
          <select className={SELECT} value={field} onChange={(e) => chooseField(e.target.value as AlertField)} aria-label="Field to watch">
            {ALERT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </Row>
        <p className="py-1 text-xs text-muted">{FIELD_HELP[field]}</p>
        <Row label="Trigger">
          <select
            className={SELECT}
            value={comparator}
            onChange={(e) => chooseComparator(e.target.value as AlertComparator)}
            aria-label="Trigger"
          >
            {ALERT_COMPARATORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Level">
          <select className={SELECT} value={sourceId} onChange={(e) => chooseSource(e.target.value)} aria-label="Take the threshold from a level">
            <option value="">Your own price</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({formatThreshold("last", s.level)})
              </option>
            ))}
          </select>
        </Row>
        {source && (
          <div className="py-2 text-xs text-muted">
            {source.note && <p>{source.note}</p>}
            <label className="mt-1 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={closeBeyond} onChange={(e) => toggleCloseBeyond(e.target.checked)} />
              Wait for a close 3 points beyond it (the definite indication that the level is crossed)
            </label>
          </div>
        )}
        <Row label="Threshold">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Lower the threshold"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border hover:bg-background"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={thresholdText}
              onChange={(e) => {
                setThresholdText(e.target.value);
                setSourceId("");
                setCloseBeyond(false);
              }}
              aria-label="Threshold"
              className="h-10 w-28 rounded-lg border border-border bg-background px-2 text-center text-sm tabular-nums"
            />
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Raise the threshold"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-border hover:bg-background"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Row>
        {more && (
          <>
            <Row label="Expires">
              <select className={SELECT} value={expiry} onChange={(e) => setExpiry(e.target.value as AlertExpiry)} aria-label="Expires">
                <option value="gtc">When it fires or you remove it</option>
                <option value="day">At the next 4 PM ET close</option>
              </select>
            </Row>
            <Row label="Note">
              <input
                type="text"
                maxLength={ALERT_NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why this level matters"
                className="h-10 w-full rounded-lg border border-border bg-background px-2 text-sm sm:w-56"
              />
            </Row>
          </>
        )}
      </div>

      {problem && thresholdText.trim() !== "" && <p className="mt-2 text-xs text-bear">{problem}</p>}
      {alreadyTrue && (
        <p className="mt-2 text-xs text-warn">
          This is already true now ({FIELD_LABELS[field]} {formatThreshold(field, current!)}), so it fires on the next check.
        </p>
      )}
      {message && <p className={cn("mt-2 text-xs", message.tone === "ok" ? "text-bull" : "text-bear")}>{message.text}</p>}
      <p className="mt-3 text-xs text-muted">
        Alerts are checked about every 30 minutes while the market is open, and reach you on the bell, by push if you
        turned it on, and by email. Use Day high or Day low to catch a touch between checks.
      </p>

      <h3 className="mt-5 text-sm font-semibold">Your alerts on {sym}</h3>
      {alerts.length === 0 ? (
        <p className="mt-1 text-xs text-muted">None yet.</p>
      ) : (
        <ul className="mt-1 flex flex-col divide-y divide-border text-sm">
          {alerts.map((a) => {
            const f = a.field ?? "last";
            return (
              <li key={a.id} className="flex items-start gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {describeAlertRule({ symbol: a.symbol, field: f, comparator: comparatorOf(a), threshold: Number(a.target_price) })}
                    {a.origin === "chart" && <span className="ml-1 text-xs font-normal text-muted">(chart line)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {a.triggered
                      ? `Fired${a.triggered_value != null ? ` at ${formatThreshold(f, Number(a.triggered_value))}` : ""}${a.triggered_at ? `, ${new Date(a.triggered_at).toLocaleString()}` : ""}`
                      : a.expires_at
                        ? `Waiting, until ${new Date(a.expires_at).toLocaleString()}`
                        : "Waiting"}
                    {a.level_source ? ` · ${a.level_source}` : ""}
                    {a.note ? ` · ${a.note}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  aria-label={`Remove alert ${describeAlertRule({ symbol: a.symbol, field: f, comparator: comparatorOf(a), threshold: Number(a.target_price) })}`}
                  className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-background hover:text-bear"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}
