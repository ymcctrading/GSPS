"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { OrderLedger } from "@/components/portfolio/order-rows";
import { BlendedPositionGroup, type Closable } from "@/components/portfolio/open-positions";
import { RejectedOrders } from "@/components/portfolio/rejected-orders";
import { SyncBar } from "@/components/portfolio/sync-bar";
import { ExitActivity } from "@/components/portfolio/exit-activity";
import type { ExitsState, OrderRow, Portfolio, SyncState } from "@/components/portfolio/types";
import { countOpenLegs, groupByDisposition, sectionOrders } from "@/lib/portfolio/sections";
import { formatUsd, formatPct, cn } from "@/lib/utils";

export default function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [exits, setExits] = useState<ExitsState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Closable | null>(null);

  // Both loaders are promise chains rather than async functions on purpose:
  // every state write sits behind the fetch, so nothing can be set during the
  // render pass that kicked them off.
  const loadPortfolio = useCallback(
    () =>
      fetch("/api/portfolio")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setPortfolio(data);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err))),
    [],
  );

  /**
   * The orders fetch is where reconciliation happens server-side, so its
   * failure modes matter. A dropped request used to be swallowed whole — the
   * page kept the previous rows and said nothing, which is precisely how an
   * incomplete list gets read as a current one. Now the error surfaces and the
   * sync bar stops claiming a fresh timestamp.
   */
  const loadOrders = useCallback(
    () =>
      fetch("/api/orders")
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          setOrders(data.orders ?? []);
          setSync(data.sync ?? null);
          setExits(data.exits ?? null);
          setOrdersError(null);
        })
        .catch((err) => {
          setOrdersError(
            err instanceof Error
              ? `Couldn't refresh orders: ${err.message}`
              : "Couldn't refresh orders.",
          );
          setSync((prev) => (prev ? { ...prev, syncedAt: null } : null));
        })
        .finally(() => setOrdersLoaded(true)),
    [],
  );

  // Both loaders close over nothing, so they are stable for the life of the
  // component and this effect subscribes once.
  useEffect(() => {
    loadPortfolio();
    loadOrders();

    // Positions carry live P/L and move continuously; orders change on broker
    // events, so they poll more slowly. Both are real server round trips.
    const portfolioInterval = setInterval(loadPortfolio, 10000);
    const ordersInterval = setInterval(loadOrders, 30000);

    return () => {
      clearInterval(portfolioInterval);
      clearInterval(ordersInterval);
    };
  }, [loadPortfolio, loadOrders]);

  /** Manual refresh — a real fetch of both endpoints, not a re-render. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadPortfolio(), loadOrders()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadPortfolio, loadOrders]);

  // Null until the first snapshot lands, and it stays null if that fetch
  // failed — sectioning needs the difference between "nothing is held" and
  // "we don't know yet" to avoid reporting open positions as closed.
  const livePositions = portfolio?.blendedPositions ?? null;
  const blendedPositions = useMemo(() => livePositions ?? [], [livePositions]);
  // Open / Pending / Rejected / Closed / Canceled. Order status settles pending
  // vs. terminal; a `filled` order needs the live position list to know whether
  // the position it opened is still held. See lib/portfolio/sections.ts.
  const sections = useMemo(() => sectionOrders(orders, livePositions), [orders, livePositions]);
  const openLegCount = countOpenLegs(blendedPositions);
  const loading = portfolio === null && error === null;

  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold sm:text-2xl">Portfolio</h1>
        <Badge variant="muted">Paper account</Badge>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-bear">{error}</CardContent>
        </Card>
      )}

      {portfolio && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Equity" value={formatUsd(portfolio.account.equity)} />
          <Stat
            label="Today"
            value={formatPct(portfolio.account.dayPlPct)}
            tone={portfolio.account.dayPlPct >= 0 ? "bull" : "bear"}
          />
          <Stat label="Cash" value={formatUsd(portfolio.account.cash)} />
          <Stat label="Buying power" value={formatUsd(portfolio.account.buyingPower)} />
        </div>
      )}

      <ExitActivity exits={exits} />

      <PositionSection
        id="open-positions"
        title="Open Positions"
        count={openLegCount}
        description="Live legs at the broker, grouped by ticker — shares and every option contract on the same underlying track separately, updated every 10 seconds. Each leg shows when it was first opened."
      >
        {blendedPositions.length === 0 ? (
          <EmptyState>
            {loading ? (
              "Loading positions…"
            ) : (
              <>
                No open positions. Find a setup in the{" "}
                <Link href="/scanner" className="text-accent hover:underline">
                  scanner
                </Link>{" "}
                and place a paper order.
              </>
            )}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {blendedPositions.map((group) => (
              <BlendedPositionGroup key={group.underlying} group={group} onClose={setClosing} />
            ))}
          </div>
        )}

        {sections.open.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-muted">
              Entry orders ({sections.open.length})
            </p>
            <OrderLedger orders={sections.open} />
          </div>
        )}
      </PositionSection>

      <PositionSection
        id="pending-positions"
        title="Pending Positions"
        count={sections.pending.length}
        description="Submitted or queued at the broker — not yet filled or confirmed. Newest first, by the time the broker accepted the order."
      >
        <SyncBar sync={sync} refreshing={refreshing} onRefresh={refresh} />

        {ordersError && (
          <p className="py-3 text-sm text-bear" role="alert">
            {ordersError}
          </p>
        )}

        {sections.pending.length === 0 ? (
          <EmptyState>
            {!ordersLoaded
              ? "Loading orders…"
              : ordersError
                ? "No pending orders in the last saved list — but the broker couldn't be reached, so there may be more."
                : "No pending positions. Orders you place appear here the moment they're submitted."}
          </EmptyState>
        ) : (
          <OrderLedger orders={sections.pending} />
        )}
      </PositionSection>

      <PositionSection
        id="rejected-orders"
        title="Rejected Orders"
        count={sections.rejected.length}
        description="The broker refused these outright, so nothing was traded. Each one shows why and links back to a corrected order."
      >
        {sections.rejected.length === 0 ? (
          <EmptyState>No rejected orders.</EmptyState>
        ) : (
          <RejectedOrders orders={sections.rejected} />
        )}
      </PositionSection>

      <PositionSection
        id="closed-positions"
        title="Closed Positions"
        count={sections.closed.length}
        description="Positions that were filled and have since been exited — the trade is settled."
        collapsible
      >
        {sections.closed.length === 0 ? (
          <EmptyState>No closed positions.</EmptyState>
        ) : (
          <OrderLedger orders={sections.closed} />
        )}
      </PositionSection>

      <PositionSection
        id="unfilled-orders"
        title="Canceled & Expired"
        count={sections.unfilled.length}
        description="Orders that ended without filling and without being refused, grouped by how each one ended — a cancellation is an order pulled after the broker accepted it, an expiry is one that ran out of time."
        collapsible
      >
        {sections.unfilled.length === 0 ? (
          <EmptyState>No canceled or expired orders.</EmptyState>
        ) : (
          <div className="flex flex-col gap-5">
            {groupByDisposition(sections.unfilled).map((group) => (
              <div key={group.disposition} className="flex flex-col gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {group.label} ({group.orders.length})
                  </p>
                  <p className="text-xs text-muted">{group.description}</p>
                </div>
                <OrderLedger orders={group.orders} />
              </div>
            ))}
          </div>
        )}
      </PositionSection>

      <ClosePositionModal position={closing} onClose={() => setClosing(null)} onClosed={refresh} />
    </div>
  );
}

/**
 * One of the Portfolio panels. Every section renders its header and count even
 * when it holds nothing, so an empty bucket reads as "none right now" rather
 * than vanishing from the page.
 *
 * `collapsible` sections start collapsed — Canceled grows without bound as the
 * account keeps trading, and Closed (capped through the next trading day's
 * open, see `isClosedOrderVisible`) is still routine history — neither is what
 * the page is for. Pending and Rejected are never collapsible: both describe
 * something the user may need to act on, and a count behind a chevron is a
 * count nobody reads.
 * An empty collapsible section has nothing to hide, so it drops the toggle and
 * shows its empty state outright.
 */
function PositionSection({
  id,
  title,
  count,
  description,
  collapsible = false,
  children,
}: {
  id: string;
  title: string;
  count: number;
  description: string;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = `${id}-body`;
  const togglable = collapsible && count > 0;
  const showBody = !togglable || expanded;

  const heading = (
    <>
      <div className="flex items-center gap-1.5">
        {togglable &&
          (expanded ? (
            <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          ))}
        <CardTitle>
          {title} ({count})
        </CardTitle>
      </div>
      <CardDescription>{description}</CardDescription>
    </>
  );

  return (
    <Card>
      <CardHeader>
        {togglable ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            className="flex w-full cursor-pointer flex-col gap-1 text-left"
          >
            {heading}
          </button>
        ) : (
          heading
        )}
      </CardHeader>
      <div id={bodyId}>{showBody && <CardContent>{children}</CardContent>}</div>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

function ClosePositionModal({
  position,
  onClose,
  onClosed,
}: {
  position: Closable | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Retain the last target (rather than clearing to null with `position`) so
  // the confirmation stays legible while the modal plays its exit transition,
  // and clear the error at the same render-phase point — no effect needed for
  // either.
  const [active, setActive] = useState<Closable | null>(position);
  const [activeSymbol, setActiveSymbol] = useState(position?.symbol ?? null);
  if ((position?.symbol ?? null) !== activeSymbol) {
    setActiveSymbol(position?.symbol ?? null);
    if (position) {
      setActive(position);
      setErr(null);
    }
  }

  async function confirm() {
    if (!active) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/positions/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: active.symbol }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onClosed();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={Boolean(position)}
      onClose={onClose}
      title={active ? `Close ${active.symbol}` : ""}
      description="Liquidates the whole position at market and cancels any resting orders on the symbol."
      footer={
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="bear" className="flex-1" onClick={confirm} disabled={submitting}>
              {submitting ? "Closing…" : "Close position"}
            </Button>
          </div>
          {err && <p className="text-sm text-bear">{err}</p>}
        </div>
      }
    >
      {active && (
        <dl className="flex flex-col gap-2 text-sm">
          <Line label="Quantity" value={`${active.qty} ${active.side}`} />
          <Line label="Entry" value={active.entryLabel} />
          <Line label="Current" value={active.currentLabel} />
          <Line label="Market value" value={formatUsd(active.marketValue)} />
          <Line
            label="Unrealized P/L"
            value={`${formatUsd(active.pl)} (${formatPct(active.plPct)})`}
            tone={active.pl >= 0 ? "bull" : "bear"}
          />
        </dl>
      )}
    </Modal>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          tone === "bull" && "text-bull",
          tone === "bear" && "text-bear",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={cn(
            "mt-1 font-mono text-lg font-semibold",
            tone === "bull" && "text-bull",
            tone === "bear" && "text-bear",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
