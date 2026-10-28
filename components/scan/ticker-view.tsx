"use client";

import { useGannRulePrefs } from "@/components/gann/use-gann-rule-prefs";
import { approachingFigure } from "@/lib/gann/evenFigures";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CandleChart, type PriceMarker } from "@/components/chart/candles";
import { MarketTabs } from "@/components/chart/market-tabs";
import { ShareButton } from "@/components/chart/share-button";
import { SignalCard } from "@/components/scan/signal-card";
import { SignalRegimeCard } from "@/components/scan/signal-regime-card";
import { ConfluenceCard } from "@/components/scan/confluence-card";
import { OrderTicket } from "@/components/trade/order-ticket";
import { IntradayAlerts } from "@/components/scan/intraday-alerts";
import { GlossaryDetails } from "@/components/glossary";
import { GlossaryTerm } from "@/components/glossary-term";
import { useLiveQuote } from "@/lib/hooks/useLiveQuote";
import { intradayPlanFromQuery } from "@/lib/routes";
import { sessionLabel } from "@/lib/market/session";
import { formatUsd, formatPct, cn, parseJsonResponse } from "@/lib/utils";
import { hasFeature, type PlatformTier } from "@/lib/tiers";
import type { ScanResult } from "@/lib/types";
import type { LiveQuote } from "@/app/api/quote/route";
import type { StrategyModeId } from "@/lib/strategies/types";
import { TIME_LINE_RECORDS } from "@/lib/gann/timeRecords";
import { bindCachedPlansTo, planEvent, planEventLevel, planSessionKey, readCachedPlan, writeCachedPlan } from "@/lib/scan/planCache";
import { clearRecentCharts, rememberRecentChart } from "@/lib/charts/recent";
import { createClient } from "@/lib/supabase/client";

/** Least time between two plan reads the price or the clock asks for. */
const PLAN_EVENT_PACING_MS = 60_000;
/** One execution bar (15 minutes), the reclaim's re-ask spacing. */
const EXECUTION_BAR_MS = 15 * 60_000;
/** Tries at a new session's plan before waiting for a refresh. */
const MAX_SESSION_TRIES = 3;

export function TickerView({ symbol }: { symbol: string }) {
  const { prefs: gannPrefs } = useGannRulePrefs();
  // The technique (or script) the order ticket is explaining the plan with,
  // so the chart can switch its lines on (AGENTS.md "Strategy Modes", 2026-10-16).
  const [explain, setExplain] = useState<{
    mode: StrategyModeId;
    scriptId: string | null;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const quote = useLiveQuote(symbol);

  // Gates the chart's STRAT reversal-pattern marker overlay (System Mastery only).
  // Fetched client-side rather than threaded through from a server component,
  // since this page has none upstream of it (see app/(app)/ticker/[...symbol]/page.tsx).
  const [tier, setTier] = useState<PlatformTier | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tier?: PlatformTier } | null) => {
        if (!cancelled && data?.tier) setTier(data.tier);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const saraMarkersUnlocked = tier !== null && hasFeature(tier, "sara_sniper_chart_markers");

  // Set only by the intraday alerts panel's "Trade this" link (see
  // components/scan/intraday-alerts.tsx and lib/routes.ts's tickerHref),
  // never by a manual visit to this page — that's what makes the flag
  // trustworthy enough to gate an order on.
  const searchParams = useSearchParams();
  const intradaySourced = mounted && searchParams.get("intraday") === "1";
  const sideParam = mounted ? searchParams.get("side") : null;
  const forceSide = sideParam === "buy" || sideParam === "sell" ? sideParam : undefined;
  // The alert's own stop, first target and MTP (the Intraday style), from the same link.
  const intradayPlan = intradaySourced ? intradayPlanFromQuery(searchParams.get("stop"), searchParams.get("tp1"), searchParams.get("mtp")) : null;

  // Suppress render until hydrated to prevent client/server mismatch flicker
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  /**
   * The scan is stored together with the symbol it answers, and read back
   * only when the two still agree. Clearing it from inside the effect instead
   * would leave one committed render — this page is reached by client-side
   * links from the dashboard, scanner and portfolio, so React reuses this
   * component rather than remounting it — where the new symbol's header sits
   * above the previous symbol's entry, stop and targets.
   *
   * The plan is kept for the session it was made from (lib/scan/planCache.ts):
   * reopening the page reuses it, and only the price, chart and intraday read
   * load again. A refresh of the same symbol keeps the plan on screen until
   * the new one arrives, so the order ticket isn't torn down mid-entry.
   */
  const [scan, setScan] = useState<{
    key: string;
    result: ScanResult | null;
    error: string | null;
    // Set when the failure is temporary (a throttled data feed), which is the
    // difference between offering a retry and calling the symbol unscannable.
    retryable: boolean;
    // See lib/scoring/display.ts — whether this viewer's tier sees the exact
    // weighted score or one rounded to the nearest half point.
    exactScoreDisplayEnabled: boolean;
    // The kept plan's `planSessionKey`; a failed read keeps the old one, so
    // a plan from an earlier session still reads as due.
    session: string;
  }>({ key: "", result: null, error: null, retryable: false, exactScoreDisplayEnabled: false, session: "" });
  // Bumping `n` reads the plan again; `freshFor` skips the kept copy for that
  // symbol only, so a later visit to another symbol still uses its kept plan.
  const [reload, setReload] = useState<{ n: number; freshFor: string | null }>({ n: 0, freshFor: null });
  const [refreshing, setRefreshing] = useState(false);

  const current = scan.key === symbol ? scan : null;
  const result = current?.result ?? null;
  const error = current?.error ?? null;
  const retryable = current?.retryable ?? false;
  const exactScoreDisplayEnabled = current?.exactScoreDisplayEnabled ?? false;

  const readPlanAgain = useCallback(() => setReload((r) => ({ n: r.n + 1, freshFor: symbol })), [symbol]);

  useEffect(() => {
    rememberRecentChart(symbol);
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    const fresh = reload.freshFor === symbol;

    // A kept plan is redacted for its member: read who is signed in first
    // (local, no request), and drop the tab's plans if it is someone else.
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => data.session?.user.id ?? null)
      .catch(() => null)
      .then((userId) => {
        if (cancelled) return null;
        if (bindCachedPlansTo(userId)) clearRecentCharts();
        return fresh ? null : readCachedPlan(symbol);
      })
      .then((kept) => {
        if (cancelled) return;
        if (kept) {
          setScan({
            key: symbol,
            result: kept.result,
            error: null,
            retryable: false,
            exactScoreDisplayEnabled: kept.exactScoreDisplayEnabled,
            session: kept.session,
          });
          return;
        }
        setRefreshing(true);
        return fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
          .then((res) => parseJsonResponse<ScanResult & { exactScoreDisplayEnabled?: boolean }>(res))
          .then((data) => {
            if (cancelled) return;
            const exactScoreDisplayEnabled = Boolean(data.exactScoreDisplayEnabled);
            if (data.error) {
              setScan((prev) =>
                prev.key === symbol
                  ? // A failed refresh keeps the plan already on screen for this symbol.
                    { ...prev, error: data.error ?? null, retryable: data.errorCode === "rate_limited" || data.errorCode === "upstream" }
                  : {
                      key: symbol,
                      result: null,
                      error: data.error ?? null,
                      retryable: data.errorCode === "rate_limited" || data.errorCode === "upstream",
                      exactScoreDisplayEnabled,
                      session: "",
                    },
              );
            } else {
              const stored = writeCachedPlan(symbol, data, exactScoreDisplayEnabled);
              setScan({ key: symbol, result: data, error: null, retryable: false, exactScoreDisplayEnabled, session: stored.session });
            }
          });
      })
      .catch(
        (err) =>
          !cancelled &&
          setScan((prev) =>
            prev.key === symbol
              ? { ...prev, error: err instanceof Error ? err.message : String(err), retryable: false }
              : {
                  key: symbol,
                  result: null,
                  error: err instanceof Error ? err.message : String(err),
                  retryable: false,
                  exactScoreDisplayEnabled: false,
                  session: "",
                },
          ),
      )
      .finally(() => !cancelled && setRefreshing(false));
    return () => {
      cancelled = true;
      setRefreshing(false);
    };
  }, [symbol, reload]);

  // The plan is read again only on its own events: the session moving on, or
  // the price reaching its stop (the day's extreme included), its reclaim
  // line, its TP1 or a day's range from its entry (lib/scan/planCache.ts).
  // Checked on every quote and once a minute, since a quiet market may print
  // nothing across the session's turn; the minute check reads refs, so it
  // re-renders nothing. At most one ask a minute. Each event on each level
  // asks once: the scan's price can lag the live quote, so a read that still
  // sees the same event isn't asked again. The reclaim asks once per
  // execution bar while it holds, since the scan confirms it only on a closed
  // bar. A session read that keeps failing stops after three tries until a
  // refresh or the next session.
  const quotePrice = quote?.price ?? null;
  const dayHigh = quote?.alertQuote?.dayHigh ?? null;
  const dayLow = quote?.alertQuote?.dayLow ?? null;
  const askedRef = useRef<{ key: string; at: number; tries: number }>({ key: "", at: 0, tries: 0 });
  const latestRef = useRef({ result, session: scan.session, refreshing, quotePrice, dayHigh, dayLow, symbol });
  useEffect(() => {
    latestRef.current = { result, session: scan.session, refreshing, quotePrice, dayHigh, dayLow, symbol };
  });
  const checkPlanEvents = useCallback(() => {
    const { result, session, refreshing, quotePrice, dayHigh, dayLow, symbol } = latestRef.current;
    if (!result || refreshing) return;
    const now = Date.now();
    if (now - askedRef.current.at < PLAN_EVENT_PACING_MS) return;
    const sessionNow = planSessionKey(result.assetClass);
    let key: string;
    if (sessionNow !== session) {
      key = `${symbol}:session:${sessionNow}`;
      if (askedRef.current.key === key && askedRef.current.tries >= MAX_SESSION_TRIES) return;
    } else {
      // A stop broken by the live price asks apart from one seen only in the
      // day's extreme, and once the price is back the live break may ask
      // again: a second break of the same stop is a new break.
      const liveThrough = planEvent(result, quotePrice) === "stop";
      if (!liveThrough && askedRef.current.key.endsWith(":live")) askedRef.current.key = "";
      const event = planEvent(result, quotePrice, { high: dayHigh, low: dayLow });
      if (event == null) return;
      const suffix =
        event === "reclaim" ? `:${Math.floor(now / EXECUTION_BAR_MS)}` : event === "stop" ? (liveThrough ? ":live" : ":day") : "";
      key = `${symbol}:${event}:${planEventLevel(result, event)}${suffix}`;
      if (askedRef.current.key === key) return;
    }
    const tries = askedRef.current.key === key ? askedRef.current.tries + 1 : 1;
    askedRef.current = { key, at: now, tries };
    readPlanAgain();
  }, [readPlanAgain]);
  useEffect(() => {
    const t = setTimeout(checkPlanEvents, 0);
    return () => clearTimeout(t);
  }, [checkPlanEvents, result, quotePrice, dayHigh, dayLow, refreshing]);
  useEffect(() => {
    const timer = setInterval(checkPlanEvents, PLAN_EVENT_PACING_MS);
    return () => clearInterval(timer);
  }, [checkPlanEvents]);

  const markers: PriceMarker[] = [];
  // Gann's even figures: mark the round number the price is approaching,
  // when the trader has the notice on (lib/gann/evenFigures.ts).
  // A plan whose stop has been breached is retired (owner decision, 2026-09-30;
  // lib/gann/stopBreach.ts), so the chart draws no Entry/SL/TP/MTP lines for it.
  // The signal card says why, and what the plan was.
  const retired = Boolean(result?.stopBreach);
  const roundAhead =
    gannPrefs.roundNumberNotices && result?.levels && !retired && result.direction !== "none"
      ? approachingFigure(result.levels.entry, result.direction)
      : null;
  if (roundAhead) markers.push({ price: roundAhead.figure.price, label: "Round number", kind: "structural" });
  if (result?.levels && !retired) {
    markers.push(
      { price: result.levels.entry, label: "Entry", kind: "entry" },
      { price: result.levels.stopLoss, label: "SL", kind: "stop" },
      { price: result.levels.takeProfit1, label: "TP1", kind: "target" },
      { price: result.levels.masterProfit, label: "MTP", kind: "target" },
    );
  }
  result?.gann.fanLines.slice(0, 2).forEach((f) =>
    markers.push({
      price: f.price,
      label: `${f.role === "support" ? "Support" : "Resistance"} ${f.angle}`,
      kind: "structural",
    }),
  );
  result?.gann.squareOf9.slice(0, 2).forEach((s) =>
    markers.push({
      price: s.price,
      label: `Key ${s.role === "support" ? "support" : "resistance"} level ${s.degree}°`,
      kind: "structural",
    }),
  );

  // The Signal and Regime Engine's own plan is not drawn here. Its one-cent
  // entry and 2R target are not the method's rules, and lines beside the
  // plan's own Entry and SL contradicted them (owner, 2026-10-20). Its
  // reading stays on the Signal and Regime card.

  // Live price falls back to the scan snapshot until the first poll returns.
  const livePrice = quote?.price ?? (result && result.currentPrice > 0 ? result.currentPrice : null);

  const { headerRef, stuck } = useStuckHeader();

  return (
    // `min-w-0` on the column and on every grid child is what keeps a wide
    // child (the options chain, the depth ladder) scrolling inside its own box
    // instead of stretching the page — the cause of the sideways scroll and the
    // clipped header on phones.
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      {/*
       * The symbol and its price never leave the screen: everything below —
       * chart, ticket, research, signal — is read against them, and scrolling
       * back up to check which symbol you are looking at is the one thing this
       * page should never ask for. The bar pins directly under the app nav.
       *
       * Only the chrome changes when it pins — never the contents, the type
       * sizes or the padding. A bar that condensed on pinning would change
       * height, and since it is the first element in the flow, every pixel it
       * loses or gains yanks the whole page under the reader's eyes at the
       * exact moment they are scrolling past it.
       */}
      <div
        ref={headerRef}
        className={cn(
          // The negative margins cancel the shell's gutter so the pinned bar
          // spans the full width; the padding puts the gutter back inside it.
          "sticky top-14 z-30 -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6",
          stuck && "border-b border-border bg-surface/90 backdrop-blur",
        )}
      >
        <h1 className="text-lg font-semibold sm:text-2xl">{symbol}</h1>
        <PriceHeader quote={quote} fallbackPrice={livePrice} />
        {/*
         * Phones keep the bar to what has to be there. The turn window is a
         * standing condition rather than a live reading, and the research tab
         * carries it on every screen size.
         */}
        {/* CYC-30: a time line is shown with its measured record, or not at all (lib/gann/timeRecords.ts). */}
        {TIME_LINE_RECORDS.timeCycle && result?.gann.timeCycleActive && (
          <span className="hidden text-xs font-medium text-warn sm:inline">
            ⏱ <GlossaryTerm term="Cyclical turn window" label="Cyclical turn window" className="decoration-warn/60" /> active
            <span className="font-normal text-muted"> ({TIME_LINE_RECORDS.timeCycle.summary})</span>
          </span>
        )}
        {TIME_LINE_RECORDS.yearCycles && result && (result.gann.yearCycleBullishHits ?? 0) + (result.gann.yearCycleBearishHits ?? 0) > 0 && (
          <span className="hidden text-xs font-medium text-warn sm:inline">
            ⟳ <GlossaryTerm term="Yearly cycles converging" label="Yearly cycles converging" className="decoration-warn/60" />
            {" "}({result.gann.yearCycleBullishHits ?? 0} from lows, {result.gann.yearCycleBearishHits ?? 0} from highs)
            <span className="font-normal text-muted"> ({TIME_LINE_RECORDS.yearCycles.summary})</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {result && (
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span>Plan as of {planTime(result.scannedAt)}</span>
              <button
                type="button"
                onClick={readPlanAgain}
                disabled={refreshing}
                className="min-h-9 cursor-pointer underline underline-offset-2 hover:text-foreground disabled:cursor-default disabled:no-underline"
              >
                {refreshing ? "Refreshing…" : "Refresh plan"}
              </button>
            </span>
          )}
          <ShareButton symbol={symbol} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
        {/*
         * Phones lead with the order ticket: the chart is the reference, but the
         * ticket is what someone opened the page to act on, and scrolling past a
         * 320px chart to reach it on every visit is the wrong default. The
         * laptop layout puts the chart back on the left.
         */}
        <Card className="min-w-0 lg:col-span-2 lg:order-1">
          <CardHeader>
            <CardTitle>Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <CandleChart
              symbol={symbol}
              markers={markers}
              livePrice={quote?.price ?? null}
              enableTrading
              saraMarkersUnlocked={saraMarkersUnlocked}
              explainMode={explain?.mode ?? null}
              explainScriptId={explain?.scriptId ?? null}
            />
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4 sm:gap-6 lg:order-2">
          {error && (
            <Card>
              <CardContent className="py-6 text-sm text-bear">
                <p className="break-words">{error}</p>
                {retryable && (
                  <button
                    onClick={readPlanAgain}
                    className="mt-2 min-h-9 cursor-pointer underline underline-offset-2"
                  >
                    Retry scan →
                  </button>
                )}
              </CardContent>
            </Card>
          )}
          {!result && !error && (
            <Card>
              <CardContent className="py-6 text-sm text-muted">
                Running the structural scan — macro structure, support analysis, pattern triggers…
              </CardContent>
            </Card>
          )}
          {result && (
            <OrderTicket
              // A plan that changed side or verdict is a new plan: the ticket
              // opens fresh on it rather than keeping the old one's choices.
              key={`${symbol}:${result.direction}:${result.decision?.outputState ?? ""}`}
              result={result}
              livePrice={livePrice}
              intradaySourced={intradaySourced}
              intradayPlan={intradayPlan}
              forceSide={forceSide}
              onExplainChange={setExplain}
            />
          )}
        </div>
      </div>

      <MarketTabs symbol={symbol} result={result} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />

      {/* The intraday read of this symbol, beside the daily verdict and
          labelled apart from it: a daily Reject and an intraday signal can
          stand together (TSLA, 2026-10-21). Hidden where the plan has no
          intraday access or nobody is signed in. */}
      <IntradayAlerts symbols={[symbol]} hideWhenLocked title={`${symbol} intraday, separate from the daily verdict`} />

      {result && <SignalCard result={result} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />}

      {result && <SignalRegimeCard result={result} />}

      {result && <ConfluenceCard result={result} />}

      <GlossaryDetails />
    </div>
  );
}

/** "10:42 AM", or "Oct 27, 4:05 PM" for a plan read on another day. */
function planTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const sameDay = at.toDateString() === new Date().toDateString();
  return at.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Height of the app nav the header pins beneath (`h-14`), in pixels. */
const NAV_HEIGHT = 56;

/**
 * Whether the header is currently pinned rather than sitting in its resting
 * place. Driven by the header's own position rather than a scroll offset, so
 * it stays correct when anything above it changes height.
 *
 * A sentinel element would be the other way to do this, but it has to be a
 * flex child of a `gap`-spaced column, and would open a gap of its own between
 * the header and the content below it.
 */
function useStuckHeader() {
  const headerRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = headerRef.current;
      if (el) setStuck(el.getBoundingClientRect().top <= NAV_HEIGHT + 0.5);
    };
    // One measurement per frame at most: the listener fires far more often
    // than the browser paints, and each measurement forces a layout read.
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return { headerRef, stuck };
}

function PriceHeader({ quote, fallbackPrice }: { quote: LiveQuote | null; fallbackPrice: number | null }) {
  const price = quote?.price ?? fallbackPrice;
  if (price == null) return null;

  const session = quote?.session ?? "regular";
  const extended = session === "pre" || session === "post";
  const closed = session === "closed";
  const live = session === "regular" || quote?.assetClass === "crypto";

  // During extended hours / closed, the change we headline is the extended move
  // vs the regular close; during the regular session it's the day's change.
  const headlinePct = extended ? quote?.extendedPct : quote?.changePct;
  const headlineAbs = extended ? quote?.extendedAbs : quote?.changeAbs;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="font-mono text-lg font-semibold tabular-nums sm:text-2xl">
        {formatUsd(price)}
      </span>

      {headlinePct != null && headlineAbs != null && (
        <span
          className={cn(
            "font-mono text-sm font-medium tabular-nums",
            headlinePct >= 0 ? "text-bull" : "text-bear",
          )}
        >
          {headlineAbs >= 0 ? "+" : "−"}
          {formatUsd(Math.abs(headlineAbs))} ({formatPct(headlinePct)})
        </span>
      )}

      {/* Session pill */}
      <span
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
          live && "bg-bull/10 text-bull",
          extended && "bg-warn/15 text-warn",
          closed && "bg-muted/15 text-muted",
        )}
      >
        {live && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bull opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
          </span>
        )}
        {live ? "Live" : quote ? sessionLabel(session) : "…"}
      </span>

      {/*
       * When outside the regular session, show the official regular close
       * distinctly. It is a reference figure rather than a live one, so it
       * gives up its place on a phone, where the bar is pinned and every line
       * it takes is a line off the chart.
       */}
      {(extended || closed) && quote?.regularClose != null && (
        <span className="hidden text-xs text-muted sm:inline">
          Regular close <span className="font-mono tabular-nums">{formatUsd(quote.regularClose)}</span>
        </span>
      )}
    </div>
  );
}
