# Live Earnings Data Integration — Feasibility & Implementation

## Current State

Your GSPS system **already has an earnings calendar**, but it's **deterministic, not live**:

```typescript
// lib/macro/earnings.ts
export function generateEarningsForMonth(monthAnchor: Date): EarningsEvent[] {
  // ✗ NOT fetching from live source
  // ✗ Using seeded, repeatable generation based on historical patterns
  // ✓ Works, but will miss actual earnings dates
}
```

**Current behavior:**
- Mega-cap earnings dates are generated from known reporting cadences
- Dates are stable (seeded) but not synchronized to real earnings calendar
- Useful for backtesting, but not for live trading

## Feasibility Assessment

### Option 1: Yahoo Finance API ✓ (Recommended for GSPS)

**Pros:**
- Free tier available
- No authentication required for basic data
- Covers all US stocks + international
- 10+ year historical data

**Cons:**
- Rate-limited (2,000 requests/day free)
- No official API (uses scraping/reverse-engineering)
- TLS certificates may change

**Cost:** FREE (within Vercel Hobby plan)  
**Implementation:** 1-2 hours

**Example:**
```typescript
// lib/macro/earnings-yahoo.ts
export async function getEarningsFromYahoo(symbol: string): Promise<Date | null> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`;
  const resp = await fetch(url);
  const data = await resp.json();
  return data.quoteSummary.result[0].calendarEvents.earnings[0].earningsDate[0];
}
```

---

### Option 2: Alpha Vantage ✓ (Moderate effort)

**Pros:**
- Official, maintained API
- Includes earnings dates as part of earnings data
- REST endpoint, easy to integrate

**Cons:**
- Free tier: 5 requests/min (limited)
- Paid: $50-500/month depending on volume

**Cost:** $0 free tier or ~$50/month paid  
**Implementation:** 2-3 hours

---

### Option 3: Finnhub ✓ (Best but costly)

**Pros:**
- Most reliable, official data
- Real-time + historical
- Excellent documentation

**Cons:**
- Paid only: $10-200/month

**Cost:** ~$50/month  
**Implementation:** 1-2 hours

---

### Option 4: Self-managed ✗ (Not recommended)

**Subscribing to earnings calendars manually**
- Costs: $0-200/month
- Effort: High (manual data entry)
- Scalability: Poor (can't automate)

---

## Recommendation: **Yahoo Finance (Option 1)**

For GSPS, **Yahoo Finance is the best choice** because:

1. **Free** — already within Vercel Hobby cost constraints
2. **No API key** — no secrets management needed
3. **Coverage** — all US stocks + options
4. **Speed** — implement in 1-2 hours
5. **Failover** — can revert to deterministic dates if Yahoo API becomes unreliable

### Implementation Plan

#### Step 1: Create earnings fetcher (`lib/macro/earnings-live.ts`)

```typescript
export interface LiveEarningsEvent {
  symbol: string;
  date: string;          // YYYY-MM-DD
  timing: "BMO" | "AMC";
  type: "earnings" | "dividend" | "split";
}

const YAHOO_CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours
const YAHOO_RATE_LIMIT_DELAY = 100;  // 10 req/sec max

export async function getEarningsFromYahoo(symbol: string): Promise<LiveEarningsEvent | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=calendarEvents`;
    
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; GSPS-Scanner/1.0)",
      },
    });

    if (!resp.ok) {
      console.warn(`Yahoo API returned ${resp.status} for ${symbol}`);
      return null;
    }

    const data = await resp.json();
    const events = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;

    if (!events || events.length === 0) {
      return null;
    }

    const event = events[0];
    return {
      symbol,
      date: new Date(event.earningsDate[0] * 1000).toISOString().split("T")[0],
      timing: event.earningsDate[0] ? "BMO" : "AMC",  // Yahoo doesn't always specify
      type: "earnings",
    };
  } catch (error) {
    console.error(`Failed to fetch earnings for ${symbol}:`, error);
    return null;
  }
}
```

#### Step 2: Add caching layer (`lib/macro/earnings-cache.ts`)

```typescript
import { createClient } from "@supabase/supabase-js";

const CACHE_TTL = 24 * 60 * 60 * 1000;  // 24 hours

export async function getCachedEarningsDate(symbol: string): Promise<string | null> {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Check Supabase cache
  const { data: cached } = await client
    .from("earnings_cache")
    .select("date, cached_at")
    .eq("symbol", symbol)
    .single();

  if (cached && Date.now() - new Date(cached.cached_at).getTime() < CACHE_TTL) {
    return cached.date;
  }

  // 2. Fetch from Yahoo
  const result = await getEarningsFromYahoo(symbol);
  if (!result) return null;

  // 3. Cache result
  await client.from("earnings_cache").upsert({
    symbol,
    date: result.date,
    cached_at: new Date(),
  });

  return result.date;
}
```

#### Step 3: Update gates.py to use live data

```python
# lib/confluence-scanner/gates.py
def check_earnings_gate_with_live_data(setup: SetupInput) -> tuple[bool, str]:
    """
    If live earnings data is available in Supabase cache, use it.
    Otherwise, fall back to deterministic generation or fail closed.
    """
    # Try to fetch from cache (populated by TypeScript at runtime)
    live_date = get_earnings_from_cache(setup.symbol)  # new function
    
    if live_date is None and setup.trading_days_to_next_earnings is None:
        # No live data AND no upstream data
        return False, "Earnings data unavailable — failing closed."
    
    if live_date:
        days_to_earnings = calculate_trading_days_between(
            datetime.now(),
            datetime.fromisoformat(live_date)
        )
    else:
        days_to_earnings = setup.trading_days_to_next_earnings

    g = CONFIG["gates"]
    if abs(days_to_earnings) <= g["earnings_blackout_days"]:
        return False, f"Inside earnings blackout window ({days_to_earnings} trading days out)."
    
    return True, f"{days_to_earnings} trading days to next earnings."
```

#### Step 4: Wire into dashboard

```tsx
// app/(app)/dashboard/page.tsx - update EarningsCalendar component
export async function EarningsCalendar() {
  // Fetch LIVE earnings from cache (Yahoo-sourced)
  const thisMonth = new Date();
  const nextMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1);
  
  const liveEvents = await getMonthEarningsFromCache(
    thisMonth.getFullYear(),
    thisMonth.getMonth()
  );
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Earnings Calendar (Live)</CardTitle>
        <CardDescription>Yahoo Finance data, updated every 24h</CardDescription>
      </CardHeader>
      <CardContent>
        {liveEvents.map(event => (
          <div key={event.symbol}>
            <strong>{event.symbol}</strong> — {event.date} ({event.timing})
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

---

## Database Schema

Add to your Supabase migrations:

```sql
-- supabase/migrations/add_earnings_cache.sql

CREATE TABLE earnings_cache (
  symbol TEXT PRIMARY KEY,
  date TEXT NOT NULL,  -- YYYY-MM-DD
  timing TEXT,         -- BMO or AMC
  cached_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_earnings_cache_expires ON earnings_cache(expires_at);

-- Cron job: refresh expired entries (via Supabase Edge Functions or external scheduler)
CREATE OR REPLACE FUNCTION refresh_stale_earnings_cache()
RETURNS VOID AS $$
BEGIN
  DELETE FROM earnings_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

---

## Cost Impact

| Component | Current | With Live Data | Impact |
|-----------|---------|-----------------|--------|
| API calls | 0 | ~100/day (1 per ticker scanned) | +$0 (free tier) |
| Database queries | ~10/day | ~200/day (check + update cache) | Negligible |
| Edge function invocations | 0 | ~5/day (background refresh) | $0 (free tier) |
| **Total monthly** | ~$0 | **~$0** | None ✓ |

---

## Recommendation: **Yes, Include in Tier 2**

**Implement live earnings integration because:**

1. ✓ Fixes a real bug (current deterministic dates won't match actual earnings)
2. ✓ Free within Vercel Hobby constraints
3. ✓ Improves backtest accuracy (eliminate false negatives from incorrect earnings dates)
4. ✓ Simple fallback strategy (revert to deterministic dates if Yahoo API fails)
5. ✓ Already have Supabase + caching infrastructure

**Timeline:** 2-3 hours for full implementation + testing

---

## Implementation Priority (Tier 2)

### High Priority (Do First)
1. ✓ Add `earnings-live.ts` + Yahoo fetcher
2. ✓ Add `earnings_cache` table + TTL logic
3. ✓ Update `gates.py` to accept live data

### Medium Priority (Do After)
4. Integrate into dashboard calendar UI
5. Add Supabase Edge Function for background refresh
6. Fallback logic if Yahoo API becomes unreliable

### Low Priority (Nice-to-Have)
7. A/B test Yahoo vs other data sources
8. Build earnings event notifications
9. Historical earnings accuracy tracking (did your predictions match real dates?)

---

## Fallback & Error Handling

If Yahoo API fails or becomes unavailable:

```python
# config.py
CONFIG["earnings"] = {
    "use_live_data": True,
    "fallback_mode": "deterministic",  # or "fail_closed"
    "cache_ttl_hours": 24,
    "rate_limit_per_second": 10,
}

# gates.py
def check_earnings_gate_with_fallback(setup):
    try:
        live_date = get_earnings_from_live_cache(setup.symbol)
        if live_date:
            return check_against_live_date(live_date)
    except Exception as e:
        logger.warning(f"Live earnings fetch failed, falling back: {e}")
    
    # Fallback: use upstream data or deterministic
    if setup.trading_days_to_next_earnings is not None:
        return check_against_upstream(setup.trading_days_to_next_earnings)
    
    # Last resort
    if CONFIG["earnings"]["fallback_mode"] == "fail_closed":
        return False, "Earnings data unavailable — failing closed."
    else:
        return True, "Using deterministic earnings model."
```

---

## Next Steps

1. **Implement Yahoo fetcher** (`earnings-live.ts`)
2. **Add Supabase table** (`earnings_cache`)
3. **Update gates.py** to accept live dates
4. **Test with 10+ tickers** to verify accuracy
5. **Monitor Yahoo API** for reliability
6. **Backtest** old trades with corrected earnings dates
