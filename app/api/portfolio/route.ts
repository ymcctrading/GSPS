/**
 * GSPS — /api/portfolio
 * Back-office snapshot: the caller's own open positions and what they add up
 * to, read from the shared paper account.
 *
 * ## Why this is not simply "the account"
 *
 * Every user of this deployment trades one Alpaca paper account. This route
 * used to return that account's `equity`, `cash`, `buying_power` and its
 * complete position list to any signed-in caller, which meant every user could
 * read every other user's book and the account's balances.
 *
 * So the broker's answer is now filtered through `lib/portfolio/ownership.ts`
 * before anything is returned: positions the caller's own ledger doesn't
 * account for are dropped, a position they only partly own is scaled to their
 * share, and the summary figures are derived from what is left rather than
 * read off the account.
 *
 * Two consequences worth stating plainly, because the response says so too:
 *
 *   - **Cash and buying power are null.** They are properties of the account,
 *     not of a user, and there is no honest way to divide them. A number that
 *     looked per-user would be a fiction, and it is spendable by everyone.
 *   - **`avgEntry` is the account's blended average** for a symbol two users
 *     both hold, not the caller's own entry price. Correcting that needs
 *     per-user brokerage connections; until then the field is approximate and
 *     `positionScope` in the response marks it as such.
 *
 * Both disappear once each user connects their own account, at which point the
 * broker's book *is* their book and this filtering retires.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  envCreds,
  getAccount,
  getPositions,
  listFillActivities,
  type AlpacaCreds,
  type AlpacaPosition,
} from "@/lib/brokers/alpaca";
import { getMarketDataProvider } from "@/lib/data/provider";
import { isCryptoSymbol } from "@/lib/data/alpaca";
import { buildBlendedPositions, type RawPosition } from "@/lib/portfolio/blend";
import { parseOccSymbol } from "@/lib/portfolio/occ";
import { deriveOpenedAtBySymbol, type Execution, type OpenedAt } from "@/lib/portfolio/opened-at";
import {
  reconcilePositions,
  type LivePosition,
  type ReconcileOutcome,
} from "@/lib/portfolio/reconcile";
import { ownedQty, readOwnershipLedger, type OwnershipLedger } from "@/lib/portfolio/ownership";

/**
 * How far back to walk the fill history when deriving open timestamps.
 *
 * A position held longer than this replays against an incomplete history, and
 * `deriveOpenedAt` reports that as `insufficient-history` rather than dating
 * the position from the first fill it happens to see. Widening the window
 * costs more broker pages; it never makes a wrong timestamp right.
 */
const FILL_HISTORY_DAYS = 365;

/**
 * Executions for every currently-held symbol, as `deriveOpenedAt` consumes
 * them. A broker failure yields an empty list, which surfaces as
 * "Unavailable — historical fill data missing" on each row rather than a
 * fabricated date.
 */
async function fetchExecutions(creds: AlpacaCreds): Promise<Execution[]> {
  try {
    const activities = await listFillActivities(creds, {
      since: new Date(Date.now() - FILL_HISTORY_DAYS * 24 * 3600 * 1000),
    });
    return activities.map((a) => ({
      symbol: a.symbol,
      // Alpaca reports a short sale as `sell_short`; for net-quantity purposes
      // it is a sell like any other.
      side: a.side === "buy" ? "buy" : "sell",
      filledQty: Number(a.qty),
      filledAt: a.transaction_time,
    }));
  } catch (err) {
    console.error(
      `portfolio: fill history unavailable — ${err instanceof Error ? err.message : String(err)}`,
    );
    return [];
  }
}

/**
 * Cut the broker's position list down to the caller's share of it.
 *
 * A position the ledger doesn't account for is dropped entirely. One the caller
 * partly owns is scaled: quantity and every absolute figure derived from it
 * (market value, unrealized P/L) are multiplied by their share, while the
 * per-share and percentage fields — current price, entry price, P/L percent —
 * carry through unchanged, since a ratio doesn't depend on how many shares it
 * is measured over.
 */
export function scopePositionsToOwner(
  positions: AlpacaPosition[],
  ledger: OwnershipLedger,
): AlpacaPosition[] {
  const scoped: AlpacaPosition[] = [];

  for (const p of positions) {
    const brokerQty = Math.abs(Number(p.qty));
    const owned = ownedQty(ledger, p.symbol);
    if (!Number.isFinite(brokerQty) || brokerQty === 0 || owned <= 0) continue;

    // Never claim more than the broker actually holds: a ledger that has run
    // ahead of the book (a close recorded locally but not yet at the broker)
    // must not inflate the caller's position.
    const mine = Math.min(owned, brokerQty);
    const share = mine / brokerQty;
    if (share >= 1) {
      scoped.push(p);
      continue;
    }

    const scale = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) ? String(n * share) : v;
    };
    // Preserve the sign convention: Alpaca reports a short's quantity as
    // negative, and `mine` is an absolute value.
    const signedQty = Number(p.qty) < 0 ? -mine : mine;

    scoped.push({
      ...p,
      qty: String(signedQty),
      market_value: scale(p.market_value),
      unrealized_pl: scale(p.unrealized_pl),
      unrealized_intraday_pl: scale(p.unrealized_intraday_pl),
    });
  }

  return scoped;
}

/**
 * The summary tiles, computed from the caller's own positions.
 *
 * `equity` here is the market value of what they hold — not an account equity,
 * which would include cash they don't individually have a claim on. Day P/L is
 * summed in dollars and expressed against the positions' opening value, so it
 * is the caller's day, not the account's.
 */
export function summarizeOwnedPositions(positions: AlpacaPosition[]): {
  equity: number;
  dayPl: number;
  dayPlPct: number;
} {
  let equity = 0;
  let dayPl = 0;

  for (const p of positions) {
    const value = Number(p.market_value);
    const intraday = Number(p.unrealized_intraday_pl);
    if (Number.isFinite(value)) equity += value;
    if (Number.isFinite(intraday)) dayPl += intraday;
  }

  // Opening value is what the day's P/L is a percentage *of*. Guard the case
  // where it rounds to zero rather than reporting an infinite percentage.
  const opening = equity - dayPl;
  const dayPlPct = Math.abs(opening) > 1e-9 ? (dayPl / opening) * 100 : 0;

  return { equity, dayPl, dayPlPct };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const creds = envCreds("paper");
  if (!creds) {
    return NextResponse.json(
      { error: "Paper account is not configured (missing Alpaca API keys)." },
      { status: 503 },
    );
  }

  try {
    // `account` is still read, for its currency and to confirm the broker is
    // reachable — but its equity, cash and buying power are the *account's*,
    // and none of the three is returned. See this file's header.
    const [account, brokerPositions, executions] = await Promise.all([
      getAccount(creds),
      getPositions(creds),
      fetchExecutions(creds),
    ]);

    // The ownership read is a hard dependency, not an enrichment: without it
    // there is no way to tell the caller's positions from anyone else's, and
    // the safe response is an error rather than the whole account's book.
    const ledger = await readOwnershipLedger(supabase, user.id);
    if (ledger.error) {
      console.error(`portfolio: ownership read failed — ${ledger.error}`);
      return NextResponse.json(
        { error: "Your position records couldn't be read, so the portfolio isn't available right now." },
        { status: 503 },
      );
    }

    const positions = scopePositionsToOwner(brokerPositions, ledger);
    const owned = summarizeOwnedPositions(positions);

    const rawPositions: RawPosition[] = positions.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side,
      avgEntry: Number(p.avg_entry_price),
      currentPrice: Number(p.current_price),
      marketValue: Number(p.market_value),
      unrealizedPl: Number(p.unrealized_pl),
      unrealizedPlPct: Number(p.unrealized_plpc) * 100,
      todayPlPct: Number(p.unrealized_intraday_plpc) * 100,
      assetClassHint: p.asset_class,
    }));

    // Diffs the live broker book against our own `positions` ledger on every
    // poll — this route is the only caller, and the Portfolio page's 10-second
    // refresh is what makes it run at all. A close (full or bracket-triggered)
    // gets its trade_logs row here, with a real fill price and P/L rather than
    // the pending stub /api/positions/close would otherwise be stuck with,
    // since nothing else ever revisits a closed position to fill one in.
    //
    // A reconciliation failure must not blank the portfolio the user is
    // looking at, so it is caught rather than left to reject this response —
    // the same policy the learning-table writers use elsewhere.
    //
    // This gets the *unscoped* broker list on purpose. Reconciliation decides a
    // position is closed by its symbol being absent from the book, and the
    // scoped list is derived from the ledger it is checking — feeding it that
    // would make every ledger row self-confirming, and no close would ever be
    // detected.
    //
    // The shared account limits what this can see: while another user still
    // holds a symbol, this caller's own closed position in it stays visible to
    // the broker's book and their ledger row is not retired here. That is a
    // known consequence of one account serving every user, and it resolves when
    // each user connects their own — it is not something this filter can fix.
    const livePositions: LivePosition[] = brokerPositions.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side === "short" ? "short" : "long",
      avgEntry: Number(p.avg_entry_price),
    }));
    const reconcile = await reconcilePositions(supabase, creds, user.id, livePositions).catch(
      (err): ReconcileOutcome => ({
        opened: 0,
        closed: 0,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    if (reconcile.error) {
      console.error(`portfolio: position reconciliation — ${reconcile.error}`);
    }

    // Greeks for option legs need the underlying's spot price. An equity leg
    // already carries it; option-only underlyings need a quote fetched
    // separately — bounded to just those symbols, not a market-wide call.
    const equitySymbols = new Set(
      rawPositions.filter((p) => !parseOccSymbol(p.symbol)).map((p) => p.symbol.toUpperCase()),
    );
    const optionOnlyUnderlyings = new Set(
      rawPositions
        .map((p) => parseOccSymbol(p.symbol)?.underlying)
        .filter((u): u is string => Boolean(u) && !equitySymbols.has(u!)),
    );
    const spotEntries = await Promise.all(
      [...optionOnlyUnderlyings].map(async (sym) => {
        try {
          const provider = getMarketDataProvider();
          const price = await provider.fetchLatestPrice(sym, isCryptoSymbol(sym) ? "crypto" : "us_equity");
          return [sym, price] as const;
        } catch {
          return [sym, null] as const;
        }
      }),
    );
    const spotMap = new Map<string, number | null>(spotEntries);
    const equityPriceMap = new Map(
      rawPositions.filter((p) => equitySymbols.has(p.symbol.toUpperCase())).map((p) => [p.symbol.toUpperCase(), p.currentPrice]),
    );

    // Open timestamps are derived from the execution history, not from an
    // order's placement time: a limit order can rest for days before it fills,
    // and the position began at the fill. Replayed once for the whole
    // portfolio rather than once per leg.
    const openedBySymbol: Map<string, OpenedAt> = deriveOpenedAtBySymbol(
      executions,
      new Map(rawPositions.map((p) => [p.symbol.toUpperCase(), p.qty])),
    );

    const blendedPositions = buildBlendedPositions(
      rawPositions,
      (underlying) => equityPriceMap.get(underlying) ?? spotMap.get(underlying) ?? null,
      (symbol) => openedBySymbol.get(symbol),
    );

    return NextResponse.json({
      mode: "paper",
      account: {
        // The value of this caller's own positions — not the shared account's
        // equity, which includes cash and everyone else's holdings.
        equity: owned.equity,
        dayPl: owned.dayPl,
        dayPlPct: owned.dayPlPct,
        // Not divisible between users, so not reported as if it were. The UI
        // renders these as unavailable rather than as zero.
        cash: null,
        buyingPower: null,
        currency: account.currency,
      },
      /**
       * What the numbers above and the positions below actually cover, so the
       * client never has to assume. `owner` means: this caller's share of a
       * shared brokerage account, with entry prices blended at the account
       * level. See this file's header.
       */
      positionScope: "owner",
      // Flat list, kept for callers that only need the equity-shaped view
      // (e.g. the chart trade widget's live P/L drawer).
      positions: rawPositions,
      // Grouped by underlying — shares leg + each option leg, with greeks
      // modeled from the position's own premium. See lib/portfolio/blend.ts.
      blendedPositions,
      // Broker execution data, not market data. Kept as its own block so the
      // UI can say which source a number came from and when it was read.
      sync: {
        syncedAt: new Date().toISOString(),
        source: "alpaca-paper",
        /** False when the fill history couldn't be read, so open timestamps are unavailable. */
        fillHistoryAvailable: executions.length > 0,
        /** Positions opened/closed in the local ledger by this poll's reconciliation. */
        reconciled: { opened: reconcile.opened, closed: reconcile.closed },
        reconcileError: reconcile.error,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
