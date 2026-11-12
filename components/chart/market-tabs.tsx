"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StrikeOrderModal, type StrikeSelection } from "@/components/trade/strike-order-modal";
import { GlossaryTerm } from "@/components/glossary-term";
import { classifyMoneyness, strikeStep, type Moneyness } from "@/lib/options/contracts";
import { useTerms, useVocabularyTier } from "@/components/vocabulary";
import { termIsFamiliar, TERMS, type TermId } from "@/lib/school/terms";
import { CompanyPanel } from "@/components/chart/company-panel";
import { formatUsd, parseJsonResponse } from "@/lib/utils";
import type { PublicScanResult, TradeLevels } from "@/lib/types";
import { tradeSideLabel } from "@/lib/scoring/direction-copy";
import type { OptionChain, OptionContract, Level2Book } from "@/lib/data/provider";
import { formatScore, SCORE_MAX } from "@/lib/scoring/display";
import { SHOWN_TIME_RECORDS } from "@/lib/timing/shownRecords";
import { tierOfDecision } from "@/lib/setups/resting";

type Tab = "research" | "options" | "levelii" | "company";

const TABS: { id: Tab; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "options", label: "Options" },
  { id: "levelii", label: "Level II" },
  { id: "company", label: "Company" },
];

export function MarketTabs({
  symbol,
  result,
  exactScoreDisplayEnabled = false,
}: {
  symbol: string;
  result?: PublicScanResult | null;
  exactScoreDisplayEnabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("research");

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
      <div className="scroll-x no-scrollbar flex items-center gap-1 border-b border-border px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={
              "relative shrink-0 px-3 py-3 text-sm font-medium cursor-pointer transition-colors sm:py-2.5 " +
              (tab === t.id
                ? "text-accent after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent"
                : "text-muted hover:text-foreground")
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-w-0 p-3 sm:p-4">
        {tab === "research" && (
          <ResearchPanel symbol={symbol} result={result} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        )}
        {tab === "options" && (
          <OptionsPanel symbol={symbol} levels={result?.levels ?? null} />
        )}
        {tab === "levelii" && <Level2Panel symbol={symbol} />}
        {tab === "company" && (
          <CompanyPanel symbol={symbol} result={result} exactScoreDisplayEnabled={exactScoreDisplayEnabled} />
        )}
      </div>
    </div>
  );
}

/**
 * Panel-level failure. Rate limiting on the free data feed is transient, so it
 * reads as a wait-and-retry rather than as a broken symbol — which is how the
 * raw `too many requests.` body used to land here.
 */
export function PanelError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-bear/40 bg-bear-soft p-3 text-sm text-bear">
      <p className="break-words">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 min-h-9 cursor-pointer underline underline-offset-2">
          Try again →
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- Research */

interface IndicatorsData {
  macd: { current: number | null; signal: number | null; histogram: number | null };
  rsi: { current: number | null };
}

function ResearchPanel({
  symbol,
  result,
  exactScoreDisplayEnabled: exactScoreDisplayEnabledProp = false,
}: {
  symbol: string;
  result?: PublicScanResult | null;
  exactScoreDisplayEnabled?: boolean;
}) {
  const [reloadKey, setReloadKey] = useState(0);

  // Each fetch is stored against the request it answers and read back only
  // while the two agree, so switching symbols cannot show the previous one's
  // score or levels for a render. See components/scan/ticker-view.tsx.
  const [scan, setScan] = useState<{
    key: string;
    data: PublicScanResult | null;
    error: string | null;
    retryable: boolean;
    exactScoreDisplayEnabled: boolean;
  }>({ key: "", data: null, error: null, retryable: false, exactScoreDisplayEnabled: false });

  const scanKey = `${symbol}:${reloadKey}`;
  const own = scan.key === scanKey ? scan : null;
  const fetched = result ?? own?.data ?? null;
  const error = result ? null : (own?.error ?? null);
  const retryable = result ? false : (own?.retryable ?? false);
  // When this panel does its own fetch (no `result` prop — reached outside
  // TickerView), the tier flag rides the same response rather than the
  // caller's prop, which wouldn't apply.
  const exactScoreDisplayEnabled = result
    ? exactScoreDisplayEnabledProp
    : (own?.exactScoreDisplayEnabled ?? false);

  useEffect(() => {
    if (result) return; // The parent already scanned; don't duplicate it.
    let cancelled = false;
    const key = `${symbol}:${reloadKey}`;
    fetch(`/api/scan?ticker=${encodeURIComponent(symbol)}`)
      .then((r) => parseJsonResponse<PublicScanResult & { exactScoreDisplayEnabled?: boolean }>(r))
      .then((d) => {
        if (cancelled) return;
        const exactScoreDisplayEnabled = Boolean(d.exactScoreDisplayEnabled);
        setScan(
          d.error
            ? {
                key,
                data: null,
                error: d.error,
                retryable: d.errorCode === "rate_limited" || d.errorCode === "upstream",
                exactScoreDisplayEnabled,
              }
            : { key, data: d, error: null, retryable: false, exactScoreDisplayEnabled },
        );
      })
      .catch(
        (e) =>
          !cancelled &&
          setScan({
            key,
            data: null,
            error: e instanceof Error ? e.message : String(e),
            retryable: false,
            exactScoreDisplayEnabled: false,
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [symbol, result, reloadKey]);

  const [ind, setInd] = useState<{
    symbol: string;
    data: IndicatorsData | null;
    error: string | null;
  }>({ symbol: "", data: null, error: null });

  const indForSymbol = ind.symbol === symbol ? ind : null;
  const indicators = indForSymbol?.data ?? null;
  const indicatorsError = indForSymbol?.error ?? null;

  // Load MACD and RSI indicators. A prior bug here (wrong fetchBars argument
  // count, plus "5m" not resolving to a real timeframe) made every one of these
  // requests 502, and the failure was invisible because it was swallowed
  // silently — this section stayed blank with no clue why. Both bugs are fixed
  // upstream (see lib/timeframe.ts / app/api/indicators/route.ts), and the
  // failure path here now surfaces the error instead of erasing it, so a
  // regression shows up in the UI rather than as a quietly missing section.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/indicators?symbol=${encodeURIComponent(symbol)}&timeframe=5m`)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then((d) => !cancelled && d && setInd({ symbol, data: d, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setInd({ symbol, data: null, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (error) {
    return <PanelError message={error} onRetry={retryable ? () => setReloadKey((k) => k + 1) : undefined} />;
  }
  if (!fetched) return <Skeleton label="Running the protocol scan…" />;

  const tier = tierOfDecision(fetched.decision);
  const dirVariant = tier === "Execute" ? "bull" : tier === "Reject" ? "bear" : tier === "Resting" ? "default" : "warn";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={dirVariant}>{tier}</Badge>
        <span className="text-sm text-muted">
          Score{" "}
          <span className="font-semibold text-foreground">
            {formatScore(fetched.decision.score, exactScoreDisplayEnabled)}
          </span>
          /{SCORE_MAX}
        </span>
        {fetched.direction !== "none" && (
          <Badge variant={fetched.direction === "bullish" ? "bull" : "bear"}>
            {tradeSideLabel(fetched.direction)}
          </Badge>
        )}
        {/* CYC-30: a time line is shown with its measured record, or not at all (lib/timing/shownRecords.ts). */}
        {SHOWN_TIME_RECORDS.timing && fetched.chartLevels?.timingActive && (
          <Badge variant="warn">
            ⏱ <GlossaryTerm term="Cyclical turn window" label="Cyclical turn window" className="decoration-warn/60" />
            <span className="font-normal"> ({SHOWN_TIME_RECORDS.timing.summary})</span>
          </Badge>
        )}
        {SHOWN_TIME_RECORDS.longTermTiming && (fetched.chartLevels?.longTermTimingCount ?? 0) > 0 && (
          <Badge variant="warn">
            ⟳ <GlossaryTerm term="Long-term timing lines up" label="Long-term timing lines up" className="decoration-warn/60" />
            <span className="font-normal"> ({SHOWN_TIME_RECORDS.longTermTiming.summary})</span>
          </Badge>
        )}
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Multi-timeframe trend
        </h4>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {fetched.trends.map((t) => (
            <div key={t.timeframe} className="rounded-lg border border-border px-3 py-2">
              <div className="text-xs text-muted">{t.timeframe}</div>
              <div
                className={
                  "text-sm font-medium " +
                  (t.direction === "bullish"
                    ? "text-bull"
                    : t.direction === "bearish"
                      ? "text-bear"
                      : "text-muted")
                }
              >
                {t.direction}
              </div>
            </div>
          ))}
        </div>
      </section>

      {(fetched.chartLevels?.trendLines.length ?? 0) > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <GlossaryTerm
              term="What the grey dashed lines are"
              label="Structural levels near price"
            />
          </h4>
          <div className="flex flex-wrap gap-2 text-xs">
            {fetched.chartLevels.trendLines.slice(0, 4).map((f, i) => (
              <span key={`f${i}`} className="rounded-md bg-background px-2 py-1 text-muted">
                <GlossaryTerm term="Support / resistance line" label={`${f.role === "support" ? "Support" : "Resistance"} line`} />:{" "}
                <span className="font-mono text-foreground">{formatUsd(f.price)}</span>
              </span>
            ))}
            {fetched.chartLevels.keyLevels.slice(0, 4).map((s, i) => (
              <span key={`s${i}`} className="rounded-md bg-background px-2 py-1 text-muted">
                Key level: <span className="font-mono text-foreground">{formatUsd(s.price)}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/*
       * No criterion-by-criterion checklist here. The conditions the score
       * tests are the scoring model, and they are not published — the API
       * strips them (lib/scoring/public-summary.ts) and the protocol signal
       * card shows the pillar rollup instead.
       */}

      {indicatorsError && !indicators && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Technical indicators (5m)
          </h4>
          <p className="text-sm text-bear">{indicatorsError}</p>
        </section>
      )}

      {indicators && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Technical indicators (5m)
          </h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {indicators.macd.current !== null && (
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted">MACD</div>
                <div className="font-mono text-sm font-medium text-foreground">
                  {indicators.macd.current.toFixed(2)}
                </div>
                {indicators.macd.signal !== null && (
                  <div className="text-xs text-muted">Signal: {indicators.macd.signal.toFixed(2)}</div>
                )}
                {indicators.macd.histogram !== null && (
                  <div
                    className={
                      "text-xs " +
                      (indicators.macd.histogram > 0 ? "text-bull" : indicators.macd.histogram < 0 ? "text-bear" : "text-muted")
                    }
                  >
                    Hist: {indicators.macd.histogram.toFixed(2)}
                  </div>
                )}
              </div>
            )}
            {indicators.rsi.current !== null && (
              <div className="rounded-lg border border-border px-3 py-2">
                <div className="text-xs text-muted">RSI (14)</div>
                <div
                  className={
                    "font-mono text-sm font-medium " +
                    (indicators.rsi.current > 70
                      ? "text-bear"
                      : indicators.rsi.current < 30
                        ? "text-bull"
                        : "text-foreground")
                  }
                >
                  {indicators.rsi.current.toFixed(1)}
                </div>
                <div className="text-xs text-muted">
                  {indicators.rsi.current > 70 ? "Overbought" : indicators.rsi.current < 30 ? "Oversold" : "Neutral"}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Options */

type StrikeFilter = "all" | "5" | "10" | "15" | "25" | "50";
type MoneynessFilter = "all" | Moneyness;
type SpreadType = "custom" | "call_spread" | "put_spread" | "iron_condor";

interface ChainResponse extends OptionChain {
  source?: string;
  horizon?: { months: number; maxDate: string; expirations: string[] };
}

function OptionsPanel({
  symbol,
  levels,
}: {
  symbol: string;
  /** Protocol levels for the underlying, when a scan has produced them. */
  levels: TradeLevels | null;
}) {
  const [strikeFilter, setStrikeFilter] = useState<StrikeFilter>("all");
  const [moneynessFilter, setMoneynessFilter] = useState<MoneynessFilter>("all");
  const [spreadType, setSpreadType] = useState<SpreadType>("custom");
  // The expiration the reader picked; null opens on the chain's own default
  // (the nearest listed expiration at least 30 days out: Gann's term, ref:
  // SRC-001 Ch. 19A, "buying PUTS and CALLS good 30 days").
  // Held with the symbol it was picked on, so a new symbol opens on its own default.
  const [pick, setPick] = useState<{ symbol: string; expiration: string } | null>(null);
  const expirationPick = pick?.symbol === symbol ? pick.expiration : null;
  const term = useTerms();
  const tier = useVocabularyTier();
  const [selection, setSelection] = useState<StrikeSelection | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Keyed on the request, so one symbol's chain never renders under another's.
  const [state, setState] = useState<{
    key: string;
    chain: ChainResponse | null;
    error: string | null;
  }>({ key: "", chain: null, error: null });

  const requestKey = `${symbol}:${expirationPick ?? ""}:${reloadKey}`;
  const current = state.key === requestKey ? state : null;
  const chain = current?.chain ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    const key = requestKey;
    const exp = expirationPick ? `&expiration=${encodeURIComponent(expirationPick)}` : "";
    fetch(`/api/options?symbol=${encodeURIComponent(symbol)}${exp}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => !cancelled && setState({ key, chain: d, error: null }))
      .catch(
        (e) =>
          !cancelled &&
          setState({ key, chain: null, error: e instanceof Error ? e.message : String(e) }),
      );
    return () => {
      cancelled = true;
    };
  }, [symbol, requestKey, expirationPick]);

  if (error) return <PanelError message={error} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!chain) return <Skeleton label="Loading options chain…" />;

  const spot = chain.underlyingPrice;
  const strikes = Array.from(new Set(chain.contracts.map((c) => c.strike))).sort((a, b) => a - b);
  const byKey = new Map(chain.contracts.map((c) => [`${c.type}:${c.strike}`, c]));
  const step = strikeStep(strikes);
  const atm = strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best), strikes[0]);

  // Narrow to a window of strikes around the money, then to a moneyness tranche.
  let filteredStrikes = strikes;
  if (strikeFilter !== "all") {
    const groupSize = parseInt(strikeFilter);
    const startIdx = Math.max(0, strikes.findIndex((s) => s === atm) - Math.floor(groupSize / 2));
    filteredStrikes = strikes.slice(startIdx, startIdx + groupSize);
  }
  if (moneynessFilter !== "all") {
    // A row holds both sides, so it survives when either leg is in the tranche —
    // that's what makes every tranche reachable from the one unified grid.
    filteredStrikes = filteredStrikes.filter(
      (s) =>
        classifyMoneyness("call", s, spot, step) === moneynessFilter ||
        classifyMoneyness("put", s, spot, step) === moneynessFilter,
    );
  }

  // A real chain lists its own expirations; the simulated one has only its own.
  const expirations = chain.simulated ? [chain.expiration] : (chain.expirations ?? [chain.expiration]);
  const greekTerms: TermId[] = ["delta", "gamma", "theta", "vega", "impliedVol", "openInterest"];
  // The tier that introduces a term reads it with its gloss (owner,
  // 2026-11-12); the grid's narrow columns carry the name, this line the gloss.
  const glosses = greekTerms.filter((id) => !termIsFamiliar(id, tier)).map((id) => TERMS[id].introduced);
  const quoteTimes = chain.contracts.map((c) => c.quoteTime).filter((t): t is string => Boolean(t)).sort();
  const asOf = quoteTimes.length ? quoteTimes[quoteTimes.length - 1] : null;

  const openTicket = (contract: OptionContract | undefined, strike: number) => {
    if (!contract) return;
    setSelection({
      contract,
      moneyness: classifyMoneyness(contract.type, strike, spot, step),
      underlying: chain.symbol,
      underlyingPrice: spot,
      simulated: chain.simulated,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            Underlying <span className="font-mono text-foreground">{formatUsd(spot)}</span>
          </span>
          <label className="flex items-center gap-1.5">
            <span>· Exp</span>
            <select
              value={chain.expiration}
              onChange={(e) => setPick({ symbol, expiration: e.target.value })}
              disabled={expirations.length < 2}
              aria-label="Expiration"
              className="rounded border border-border bg-background px-2 py-1 font-mono text-xs cursor-pointer hover:border-muted"
            >
              {expirations.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          {chain.horizon && (
            <span className="text-xs text-muted/80">· {chain.horizon.months}-month horizon</span>
          )}
          {chain.simulated && <Badge variant="muted">Simulated</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {(["all", "ITM", "ATM", "OTM"] as MoneynessFilter[]).map((f) => (
              <FilterChip
                key={f}
                active={moneynessFilter === f}
                onClick={() => setMoneynessFilter(f)}
                label={f === "all" ? "All" : f}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-1 border-l border-border pl-3">
            {(["all", "5", "10", "15", "25", "50"] as StrikeFilter[]).map((f) => (
              <FilterChip
                key={f}
                active={strikeFilter === f}
                onClick={() => setStrikeFilter(f)}
                label={f === "all" ? "All" : f}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted">Spread:</span>
            <select
              value={spreadType}
              onChange={(e) => setSpreadType(e.target.value as SpreadType)}
              className="rounded border border-border bg-background px-2 py-1 text-xs font-medium cursor-pointer hover:border-muted"
            >
              <option value="custom">Custom</option>
              <option value="call_spread">Call Spread</option>
              <option value="put_spread">Put Spread</option>
              <option value="iron_condor">Iron Condor</option>
            </select>
          </div>
          {spreadType !== "custom" && (
            <span className="text-xs text-muted/70">Multi-leg spread builder coming soon — showing single-leg chain.</span>
          )}
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH className="text-bull">Call</TH>
            <TH className="text-bull">Bid</TH>
            <TH className="text-bull">Ask</TH>
            <TH className="text-bull">Last</TH>
            <TH className="text-bull" title={term("impliedVol")}>IV</TH>
            <TH className="text-bull" title={term("delta")}>Delta</TH>
            <TH className="text-bull" title={term("gamma")}>Gamma</TH>
            <TH className="text-bull" title={term("theta")}>Theta</TH>
            <TH className="text-bull" title={term("vega")}>Vega</TH>
            <TH className="text-bull" title={term("openInterest")}>OI</TH>
            <TH className="text-bull">Vol</TH>
            <TH className="text-center font-semibold text-foreground">Strike</TH>
            <TH className="text-bear">Vol</TH>
            <TH className="text-bear" title={term("openInterest")}>OI</TH>
            <TH className="text-bear" title={term("vega")}>Vega</TH>
            <TH className="text-bear" title={term("theta")}>Theta</TH>
            <TH className="text-bear" title={term("gamma")}>Gamma</TH>
            <TH className="text-bear" title={term("delta")}>Delta</TH>
            <TH className="text-bear" title={term("impliedVol")}>IV</TH>
            <TH className="text-bear">Last</TH>
            <TH className="text-bear">Bid</TH>
            <TH className="text-bear">Ask</TH>
            <TH className="text-bear">Put</TH>
          </TR>
        </THead>
        <TBody>
          {filteredStrikes.map((strike) => {
            const call = byKey.get(`call:${strike}`);
            const put = byKey.get(`put:${strike}`);
            const callM = classifyMoneyness("call", strike, spot, step);
            const putM = classifyMoneyness("put", strike, spot, step);
            const isAtm = callM === "ATM" || putM === "ATM";
            return (
              <TR key={strike} className={isAtm ? "bg-accent-soft/60" : undefined}>
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} className="text-center">
                  <MoneynessTag moneyness={callM} />
                </StrikeCell>
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} tone={callM === "ITM" ? "bull" : undefined}>
                  {usdOrDash(call?.bid)}
                </StrikeCell>
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} tone={callM === "ITM" ? "bull" : undefined}>
                  {usdOrDash(call?.ask)}
                </StrikeCell>
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} tone={callM === "ITM" ? "bull" : undefined}>
                  {usdOrDash(call?.last)}
                </StrikeCell>
                <IvCell value={call?.iv} onOpen={() => openTicket(call, strike)} />
                <GreekCell value={call?.delta} onOpen={() => openTicket(call, strike)} />
                <GreekCell value={call?.gamma} digits={4} onOpen={() => openTicket(call, strike)} />
                <GreekCell value={call?.theta} onOpen={() => openTicket(call, strike)} />
                <GreekCell value={call?.vega} onOpen={() => openTicket(call, strike)} />
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} className="text-center">
                  {countOrDash(call?.openInterest)}
                </StrikeCell>
                <StrikeCell contract={call} onOpen={() => openTicket(call, strike)} className="text-center">
                  {countOrDash(call?.volume)}
                </StrikeCell>

                <TD className="text-center font-mono text-xs font-semibold">{formatUsd(strike)}</TD>

                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} className="text-center">
                  {countOrDash(put?.volume)}
                </StrikeCell>
                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} className="text-center">
                  {countOrDash(put?.openInterest)}
                </StrikeCell>
                <GreekCell value={put?.vega} onOpen={() => openTicket(put, strike)} />
                <GreekCell value={put?.theta} onOpen={() => openTicket(put, strike)} />
                <GreekCell value={put?.gamma} digits={4} onOpen={() => openTicket(put, strike)} />
                <GreekCell value={put?.delta} onOpen={() => openTicket(put, strike)} />
                <IvCell value={put?.iv} onOpen={() => openTicket(put, strike)} />
                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} tone={putM === "ITM" ? "bear" : undefined}>
                  {usdOrDash(put?.last)}
                </StrikeCell>
                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} tone={putM === "ITM" ? "bear" : undefined}>
                  {usdOrDash(put?.bid)}
                </StrikeCell>
                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} tone={putM === "ITM" ? "bear" : undefined}>
                  {usdOrDash(put?.ask)}
                </StrikeCell>
                <StrikeCell contract={put} onOpen={() => openTicket(put, strike)} className="text-center">
                  <MoneynessTag moneyness={putM} />
                </StrikeCell>
              </TR>
            );
          })}
        </TBody>
      </Table>

      {glosses.length > 0 && <p className="text-xs text-muted">{glosses.join(" · ")}</p>}
      <p className="text-xs text-muted/80">
        Click any strike to open a purchase ticket.{" "}
        {chain.simulated
          ? "Demo chain: no market data is connected, so strikes, quotes, volume, open interest, IV and greeks are modelled, not exchange data."
          : `Listed contracts with their exchange quotes${chain.feed === "indicative" ? " (free delayed feed)" : ""}${
              asOf ? `, as of ${formatEt(asOf)}` : ""
            }. IV and greeks are the feed's own where it sends them, otherwise solved from each contract's own quote; "—" means the quote gives none.`}
      </p>

      <StrikeOrderModal
        selection={selection}
        levels={levels}
        onClose={() => setSelection(null)}
      />
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded px-2 py-1 text-xs font-medium cursor-pointer transition-colors " +
        (active ? "bg-accent text-surface" : "border border-border hover:border-accent")
      }
    >
      {label}
    </button>
  );
}

function MoneynessTag({ moneyness }: { moneyness: Moneyness }) {
  const tone =
    moneyness === "ITM" ? "text-bull" : moneyness === "ATM" ? "text-warn" : "text-muted/60";
  return <span className={"text-[10px] font-semibold " + tone}>{moneyness}</span>;
}

/** A chain cell that opens the purchase ticket for its contract when clicked. */
function StrikeCell({
  contract,
  onOpen,
  children,
  className,
  tone,
}: {
  contract: OptionContract | undefined;
  onOpen: () => void;
  children: React.ReactNode;
  className?: string;
  tone?: "bull" | "bear";
}) {
  return (
    <TD
      onClick={contract ? onOpen : undefined}
      role={contract ? "button" : undefined}
      tabIndex={contract ? 0 : undefined}
      onKeyDown={(e) => {
        if (contract && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={
        "font-mono text-xs " +
        (tone === "bull" ? "text-bull " : tone === "bear" ? "text-bear " : "text-muted ") +
        (contract ? "cursor-pointer hover:bg-accent-soft/40 " : "") +
        (className ?? "")
      }
    >
      {children}
    </TD>
  );
}

function GreekCell({
  value,
  digits = 2,
  onOpen,
}: {
  value: number | null | undefined;
  digits?: number;
  onOpen: () => void;
}) {
  return (
    <TD
      onClick={value != null ? onOpen : undefined}
      className={
        "text-center font-mono text-xs text-muted " +
        (value != null ? "cursor-pointer hover:bg-accent-soft/40" : "")
      }
    >
      {value != null ? value.toFixed(digits) : "—"}
    </TD>
  );
}

function IvCell({ value, onOpen }: { value: number | null | undefined; onOpen: () => void }) {
  return (
    <TD
      onClick={value != null ? onOpen : undefined}
      className={
        "text-center font-mono text-xs text-muted " +
        (value != null ? "cursor-pointer hover:bg-accent-soft/40" : "")
      }
    >
      {value != null ? `${(value * 100).toFixed(1)}%` : "—"}
    </TD>
  );
}

function usdOrDash(v: number | null | undefined): string {
  return v != null ? formatUsd(v) : "—";
}

function countOrDash(v: number | null | undefined): string {
  return v != null ? v.toLocaleString() : "—";
}

/** A quote time in New York time, as the owner reads times. */
function formatEt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

/* ---------------------------------------------------------------- Level II */

function Level2Panel({ symbol }: { symbol: string }) {
  // Keyed on symbol: the book polls every 5s, and a depth ladder belonging to
  // the ticker you just navigated away from is worse than none at all.
  const [state, setState] = useState<{
    symbol: string;
    book: (Level2Book & { source?: string }) | null;
    error: string | null;
  }>({ symbol: "", book: null, error: null });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = state.symbol === symbol ? state : null;
  const book = current?.book ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      // A backgrounded tab shouldn't spend request budget on a book nobody is
      // looking at — that budget is what the price poll needs.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      return fetch(`/api/level2?symbol=${encodeURIComponent(symbol)}`)
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
          return r.json();
        })
        .then((d) => !cancelled && setState({ symbol, book: d, error: null }))
        .catch(
          (e) =>
            !cancelled &&
            // Keep the last good ladder on a transient poll failure; the render
            // guard already drops it if the symbol has moved on.
            setState((prev) => ({
              symbol,
              book: prev.symbol === symbol ? prev.book : null,
              error: e instanceof Error ? e.message : String(e),
            })),
        );
    };

    load();
    timer.current = setInterval(load, 5000); // book refreshes for a live feel
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [symbol]);

  if (error && !book) return <PanelError message={error} />;
  if (!book) return <Skeleton label="Loading market depth…" />;

  const maxSize = Math.max(...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Last <span className="font-mono text-foreground">{formatUsd(book.price)}</span>
        </span>
        <span>· Spread <span className="font-mono text-foreground">{formatUsd(book.spread)}</span></span>
        {book.simulated && <Badge variant="muted">Simulated</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <DepthColumn title="Bids" side="bid" levels={book.bids} maxSize={maxSize} />
        <DepthColumn title="Asks" side="ask" levels={book.asks} maxSize={maxSize} />
      </div>
      {book.simulated && (
        <p className="text-xs text-muted/80">
          Simulated depth anchored on the live last price — sizes are modelled, not exchange data.
          A real Level II feed drops in behind the provider seam.
        </p>
      )}
    </div>
  );
}

function DepthColumn({
  title,
  side,
  levels,
  maxSize,
}: {
  title: string;
  side: "bid" | "ask";
  levels: { price: number; size: number }[];
  maxSize: number;
}) {
  const bar = side === "bid" ? "bg-bull/15" : "bg-bear/15";
  const text = side === "bid" ? "text-bull" : "text-bear";
  return (
    <div>
      <div className={"mb-1 text-xs font-semibold uppercase tracking-wide " + text}>{title}</div>
      <div className="flex flex-col gap-0.5">
        {levels.map((l, i) => (
          <div key={i} className="relative overflow-hidden rounded">
            <div
              className={"absolute inset-y-0 " + (side === "bid" ? "right-0 " : "left-0 ") + bar}
              style={{ width: `${(l.size / maxSize) * 100}%` }}
            />
            <div className="relative flex justify-between px-2 py-1 text-xs">
              <span className={"font-mono " + text}>{formatUsd(l.price)}</span>
              <span className="font-mono text-muted">{l.size.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ shared */

export function Skeleton({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-muted">{label}</div>;
}
