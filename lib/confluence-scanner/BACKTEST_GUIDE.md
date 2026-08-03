# Backtesting via GSPS Learning Brain

## Overview

Your GSPS system has a **Learning Brain** built into it (`lib/learning/`) that records every scan event, execution, and user action to Supabase. This data is exactly what you need to run sophisticated backtests and continuously improve your confluence checklist.

## Architecture

```
Scan Event       User Action      Execution Event
    ↓                ↓                    ↓
┌─────────────────────────────────────────────────┐
│  Supabase Database (scan_events, user_actions,  │
│  execution_events, signal_lifecycle_events)     │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│  Backtest Queries (lib/learning/db.ts)          │
│  - getScanEventsByUser()                        │
│  - getSignalLifecycle()                         │
│  - getExecutionEventsByOrder()                  │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│  Win/Loss Analysis                              │
│  - Correlate factors vs outcomes                │
│  - Calculate win rates per factor               │
│  - Suggest reweighting                          │
└─────────────────────────────────────────────────┘
```

## How to Access Backtesting

### Option 1: Python Backtest (Local, CLI-based)

The standalone `backtest.py` script in this directory reads a JSONL log file and analyzes factor performance. However, **your production data lives in Supabase**, not a local file.

**To backtest your real data:**

1. **Export your scan events from Supabase:**

```typescript
// Create a new API route: app/api/learning/export-backtest-data/route.ts
import { createLearningClient } from "@/lib/learning/db";

export async function GET(request: Request) {
  const client = createLearningClient();
  const { data, error } = await client
    .from("scan_events")
    .select("*")
    .eq("user_id", userIdFromAuth)
    .order("timestamp", { ascending: false })
    .limit(1000);  // adjust as needed

  if (error) return Response.json({ error: error.message }, { status: 400 });
  
  // Convert to backtest.py JSONL format
  const lines = data.map(event => {
    return JSON.stringify({
      id: event.id,
      symbol: event.symbol,
      gates_passed: event.detail?.gates_passed ?? true,
      outcome: event.detail?.outcome ?? null,  // fill in after trades close
      factors: event.detail?.factors ?? [],
    });
  });

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain" },
  });
}
```

2. **Download the export** from `/api/learning/export-backtest-data`

3. **Run the local backtest:**
```bash
python backtest.py exported_data.jsonl
```

### Option 2: Dashboard Backtest UI (Recommended)

The Learning Brain is designed to feed into a **Backtest Dashboard** that doesn't exist yet but should be built. This UI would:

1. **Show live factor performance** — win rates per factor, correlation scores
2. **Recommend reweighting** — which factors are dead weight, which are gold
3. **Segment by timeframe/asset class** — ADX bands for equity intraday ≠ crypto swing
4. **Track model drift** — performance over time as market regimes shift

**To build this, you'd create:**

```
app/(app)/learning/
  ├── backtest-results/page.tsx   (dashboard showing factor correlations)
  ├── model-performance/page.tsx   (win rate by score band)
  └── config-tuner/page.tsx       (UI to adjust config.py and A/B test)
```

### Option 3: TypeScript Backtest in `lib/learning/backtest.ts` (Data-driven)

**Build a TypeScript backtest function** that queries Supabase directly:

```typescript
// lib/learning/backtest.ts
import { createLearningClient } from "./db";
import type { ScanEvent } from "./types";

export async function runBacktest(userId: string, minSample = 30) {
  const client = createLearningClient();
  
  // 1. Fetch all scan events with outcomes
  const { data: events, error } = await client
    .from("scan_events")
    .select("*")
    .eq("user_id", userId)
    .not("detail->outcome", "is", null)
    .order("timestamp", { ascending: false });

  if (error) throw new Error(error.message);
  
  // 2. Filter to gates-passed trades
  const usable = events.filter(e => e.detail?.gates_passed);
  
  if (usable.length < minSample) {
    return { error: `Only ${usable.length} usable samples. Need ${minSample}+.` };
  }

  // 3. Per-factor analysis
  const factorStats: Record<string, { 
    passWinRate: number; 
    failWinRate: number; 
    correlation: number; 
    samples: number 
  }> = {};

  for (const event of usable) {
    const won = event.detail.outcome === "win" ? 1 : 0;
    for (const factor of event.detail.factors || []) {
      if (!factorStats[factor.name]) {
        factorStats[factor.name] = { 
          passWinRate: 0, 
          failWinRate: 0, 
          correlation: 0, 
          samples: 0 
        };
      }
      factorStats[factor.name].samples += 1;
      
      // Track pass/fail vs outcome
      if (factor.passed) {
        factorStats[factor.name].passWinRate += won;
      } else {
        factorStats[factor.name].failWinRate += won;
      }
    }
  }

  // 4. Normalize rates and calculate correlation
  for (const [name, stats] of Object.entries(factorStats)) {
    // (simplified; use Pearson correlation in production)
    const passCount = usable.reduce((sum, e) => 
      sum + (e.detail.factors.find(f => f.name === name)?.passed ? 1 : 0), 0);
    const passWins = usable.reduce((sum, e) => {
      const f = e.detail.factors.find(f => f.name === name);
      return sum + (f?.passed && e.detail.outcome === "win" ? 1 : 0);
    }, 0);
    stats.passWinRate = passCount > 0 ? passWins / passCount : 0;
  }

  return factorStats;
}
```

## Workflow: From Scan to Backtest Insight

### 1. Scan Events Are Logged Automatically
When GSPS runs a scan (every day on your dashboard), each result is recorded to Supabase:
```typescript
// Happens automatically during scan
recordScanEvent(userId, {
  symbol: "AAPL",
  timeframe: "1h",
  score: 7.2,
  detail: { factors, gates_passed, ... }
});
```

### 2. Signal Lifecycle is Tracked
When you accept/defer/override a signal:
```typescript
recordUserAction(userId, {
  signal_id: "sig_123",
  action: "accept",
  tier: "Modest",
  override_entry: 105.50,
  override_stop: 104.20,
});
```

### 3. Execution is Recorded
When the trade fills:
```typescript
recordExecutionEvent(userId, {
  signal_id: "sig_123",
  symbol: "AAPL",
  side: "buy",
  filled_price: 105.48,
  filled_qty: 100,
  broker_status: "filled",
});
```

### 4. Outcome is Labeled
After the trade closes, the outcome is inferred:
```typescript
// In backtest, outcome is automatically derived from:
// - Did it hit TP1? → "hit_TP1" (value = 1)
// - Did it hit SL? → "hit_SL" (value = 0)
// - How many R multiples? → "R_multiple_achieved" (value = R)
```

### 5. Backtest Correlates Factors → Outcomes
```
Factor              Samples  WinRate(Pass)  WinRate(Fail)  Correlation
────────────────────────────────────────────────────────────────────
structure_confluence    124         68%            42%        +0.52
rsi_divergence           98         72%            38%        +0.68
risk_reward              124         65%            45%        +0.41
early_stage_momentum      85         58%            48%        +0.19

→ rsi_divergence is your best predictor (bump it up)
→ early_stage_momentum is weak (leave it or drop it)
```

### 6. Reweight in `config.py`
Based on backtest, adjust point allocations:
```python
CONFIG["scored_factors"]["momentum"]["rsi_divergence"]["points"] = 10  # was 8
CONFIG["scored_factors"]["execution"]["early_stage_momentum_opportunity"]["points"] = 4  # was 6
```

### 7. Repeat
After 30+ more trades, run backtest again. Track the trend over time — don't overfit to a single batch.

## Integration with GSPS Website

### Next Step: Build Backtest Dashboard

Add these pages to your dashboard:

**`app/(app)/learning/backtest-results/page.tsx`**
```tsx
export default async function BacktestPage() {
  const stats = await runBacktest(userId);
  
  return (
    <div>
      <h1>Backtest Results (Last 30 days)</h1>
      <FactorCorrelationChart data={stats} />
      <RecommendedWeights data={stats} />
      <WinRateByScoreBand data={stats} />
    </div>
  );
}
```

**`app/(app)/learning/model-live/page.tsx`**
```tsx
export default async function ModelLivePage() {
  const model = await getLiveModel("score_adjustment");
  
  return (
    <div>
      <h1>Live Learning Model</h1>
      <ModelMetrics model={model} />
      <RecentAdjustments model={model} />
      <ApprovalWorkflow model={model} />
    </div>
  );
}
```

## Summary

| Method | Data | Frequency | Effort | Recommendation |
|--------|------|-----------|--------|-----------------|
| **Python backtest.py** | JSONL export | Manual | Low | Start here for quick analysis |
| **API export** | Supabase → JSONL | Automated | Medium | Good for CI/CD backtest runs |
| **TypeScript lib/learning/backtest.ts** | Supabase direct | Real-time | Medium | Build into dashboard |
| **Dashboard UI** | Supabase + charts | Real-time | High | Long-term solution for continuous tuning |

**Recommended path:**
1. Start with Python backtest.py + manual exports
2. Build TypeScript backtest.ts for automated runs
3. Create dashboard pages to visualize results
4. Implement model versioning + approval workflow in Learning Brain
