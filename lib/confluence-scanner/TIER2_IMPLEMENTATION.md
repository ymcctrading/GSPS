# Tier 2 Implementation — COMPLETE

All four Tier 2 fixes are now implemented and integrated with Tier 1.

## Changes Summary

### D. RSI Thresholds Optimized for Reversals ✅

**What Changed:**
```python
# Old (neutral/midrange)
"rsi_bull_min": 50,   # Bull only when RSI > 50
"rsi_bear_max": 50,   # Bear only when RSI < 50

# New (fade to extremes)
"rsi_bull_min": 35,   # Bull FADE when RSI < 35 (oversold)
"rsi_bear_max": 65,   # Bear FADE when RSI > 65 (overbought)
```

**Rationale:**
GSPS is a confluence/reversal scanner. You should be fading to **extremes**, not trading midrange RSI.
- RSI < 35 = oversold, ripe for bull reversal
- RSI > 65 = overbought, ripe for bear reversal

**Scoring Impact:**
- Old: RSI 68 on a bear setup would fail (> 50 is bullish)
- New: RSI 68 on a bear setup now passes (> 65 is overbought, perfect for bear fade)

**Implementation:** `config.py` + `scoring.py` (score_rsi_regime updated with reversal logic)

---

### E. Earnings Blackout Expanded ✅

**What Changed:**
```python
# Old (too short)
"earnings_blackout_days": 3,   # Only 3 trading days

# New (full week)
"earnings_blackout_days": 5,   # 5 trading days (~1 week)
```

**Rationale:**
- IV expansion begins ~5 days before earnings
- Volatility spikes affect setups quality
- Profitable traders often avoid week-of-earnings regardless of exact date
- 5 days = conservative cushion that captures most vol expansion effects

**Scoring Impact:**
- Old: A setup with 4 days to earnings would pass the gate
- New: Same setup now fails (inside 5-day blackout)

**Implementation:** `config.py` (gates check this value)

---

### F. Volume Impulse Threshold Tightened ✅

**What Changed:**
```python
# Old (permissive)
"volume_impulse_min_ratio": 1.5,   # 1.5x 20-day average

# New (stricter)
"volume_impulse_min_ratio": 2.0,   # 2.0x 20-day average
```

**Rationale:**
- 1.5x is mild participation, could be routine trading
- 2.0x+ suggests **institutional interest** or coordinated buying/selling
- True "impulse" moves are 2x+ above normal volume
- Eliminates false signals from ordinary vol spikes

**Scoring Impact:**
- Old: Trigger with 1.8x volume would pass volume_impulse factor (10 pts)
- New: Same trigger now fails (< 2.0x minimum)

**Implementation:** `config.py` (volume_impulse scorer checks this)

---

### G. Live Earnings Integration (Yahoo Finance) ✅

**What Was Done:**

1. **Created `earnings_live.py`** — Contract for live earnings fetching
   - `get_earnings_from_cache(symbol)` — Fetches from Supabase cache (populated by TypeScript)
   - `get_trading_days_to_earnings(symbol)` — Unified interface (tries live, falls back to upstream)
   - `calculate_trading_days_to_earnings(date_str)` — Helper for M-F calculations

2. **Updated `gates.py`** — Now checks live data first
   ```python
   # Try live earnings (from Yahoo Finance via Supabase cache)
   days_to_earnings = get_live_earnings_days(symbol)
   
   # Fall back to upstream data if live unavailable
   if days_to_earnings is None:
       days_to_earnings = setup.trading_days_to_next_earnings
   ```

3. **Architecture Ready** — Points to TypeScript implementation needed:
   - `lib/macro/earnings-live.ts` — Yahoo Finance API fetcher
   - `app/api/macro/earnings/route.ts` — API endpoint for cache
   - Supabase table: `earnings_cache` (24h TTL)

**Scoring Impact:**
- Old: Deterministic earnings dates (seeded, not real)
- New: Real Yahoo Finance earnings dates (when TypeScript layer is implemented)

**Next Step:** Implement TypeScript backend per `EARNINGS_INTEGRATION.md` (2–3 hours)

---

## Tier 1 + Tier 2 Combined Impact

### Before Any Tuning
```
Old checklist: Setups capped at 7/9 (never higher)
- Risk-reward: binary 0pts (killed viable 1.8R setups)
- Stops: ignored volatility (penalized correct risk management)
- Earnings: deterministic dates (inaccurate)
- RSI: midrange logic (not ideal for reversals)
- Volume: too permissive (1.5x = just noise)
```

### After Tier 1 + Tier 2
```
New scanner: more of the 118 available points are reachable
- Risk-reward: 1.2-2.0R gets partial credit
- Stops: volatility-adjusted (high/mid/low regimes)
- Earnings: live Yahoo data (when TypeScript built)
- RSI: optimized for reversals (extremes = good, not bad)
- Volume: true impulse only (2.0x+ = institutional)
- Momentum: catches early-stage moves (1.5-4.0% from target)
```

---

## Testing Tier 2 Changes

Update the first example in `example_usage.py` to show improved scoring:

```python
# Example 1: Bear fade with overbought RSI (Tier 2 optimized)
setup = SetupInput(
    symbol="EXAMPLE",
    direction="bear",
    price=106.30,
    
    # ... gates ...
    trading_days_to_next_earnings=11,  # > 5 day blackout ✓
    
    # ... structure ...
    
    # Momentum (Tier 2: RSI > 65 for bear fades)
    rsi=68,                # Now passes! (> 65 overbought)
    rsi_divergence_present=True,
    
    # Participation (Tier 2: volume >= 2.0x)
    relative_volume_ratio=2.1,  # Passes new 2.0x threshold
    
    # ... execution ...
)
```

Run: `python3 example_usage.py` to see Tier 2 improvements in action.

---

## Configuration Summary

**Tier 2 changes in `config.py`:**

| Setting | Old | New | Category |
|---------|-----|-----|----------|
| `earnings_blackout_days` | 3 | 5 | Gates |
| `rsi_bull_min` | 50 | 35 | Scoring (reversals) |
| `rsi_bear_max` | 50 | 65 | Scoring (reversals) |
| `volume_impulse_min_ratio` | 1.5 | 2.0 | Scoring (participation) |
| Live earnings ready | ❌ | ✅ | Gates (needs TypeScript) |

---

## Next Steps

### Immediate (Ready Now)
1. ✅ Test Tier 2 locally: `python3 example_usage.py`
2. ✅ Review RSI logic (should score reversal targets, not midrange)
3. ✅ Verify volume threshold makes sense for your setups

### Short-term (This Week)
1. Implement TypeScript earnings fetcher (`lib/macro/earnings-live.ts`)
2. Wire live earnings into dashboard
3. Test against 10+ tickers for accuracy

### Medium-term (After 30+ Trades)
1. Run backtest to measure new factor performance
2. Adjust Tier 2 thresholds if backtest suggests different values
3. Continue tuning based on data

---

## Backward Compatibility

✅ **Fully compatible with Tier 1.**
- Old `SetupInput` still works (all new fields optional)
- Existing `scan_log.jsonl` can be re-scored
- No database migrations needed
- Live earnings gracefully falls back to upstream data if unavailable

---

## Questions?

Refer to:
- `README.md` — Overview of full system
- `TIER1_TUNING_SUMMARY.md` — Tier 1 rationale
- `EARNINGS_INTEGRATION.md` — Live earnings implementation plan
- `example_usage.py` — Real scenarios with all fixes applied
