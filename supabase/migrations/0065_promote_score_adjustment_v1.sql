-- Promotes learning_models score_adjustment draft v1 to live.
--
-- Proposal computed by lib/backtest/propose-weights.ts against 991 real
-- Alpaca-sourced 15Min/2R trades (SPY, AAPL, AMD, TSLA, MSFT, NVDA,
-- 2026-07-20 to 2026-09-16), attributed within=all (the unconditioned
-- population, the only scope propose-weights.ts's own design avoids
-- collider bias from) and split chronologically at 2026-08-27 (693
-- in-sample / 298 out-of-sample, both clearing MIN_TRADES_PER_HALF=40).
--
-- Only historicalSR actually moved on real out-of-sample agreement
-- (1.88 -> 1.97). adxTrendStrength and gannAngleSlope also "adopted"
-- (down-weight) but were already pinned at MIN_WEIGHT, so their displayed
-- values are unchanged. Every other criterion — including ruleOfThree,
-- the Gann-precedence criterion added 2026-09-16 — disagreed in sign
-- between the two halves, was too small to clear MIN_EFFECT_R, or was
-- unreadable (patternArmed structurally constant; stopRoom's out-of-sample
-- half too thin to trust), so per propose-weights.ts's own guardrails
-- those weights correctly held. This is the first learning_models row of
-- model_type 'score_adjustment' — there is no prior 'live' row to mark
-- 'deprecated'.
update learning_models
set status = 'live',
    approved_at = now(),
    approved_by = 'icharles.coleman@gmail.com'
where model_type = 'score_adjustment'
  and version = 1
  and status = 'draft';

insert into learning_audit_log (model_id, event_type, old_value, new_value, changed_by, reason)
select id, 'approved',
       jsonb_build_object('status', 'draft'),
       jsonb_build_object('status', 'live', 'criterion_weights', coefficients->'criterion_weights'),
       'icharles.coleman@gmail.com',
       'Promoted after operator review: 991 real Alpaca 15Min-2R trades, 693/298 chronological split at 2026-08-27, within=all (unconditioned, avoids Execute-selection collider bias). Only historicalSR moved on real out-of-sample agreement (1.88->1.97); adxTrendStrength/gannAngleSlope already floored; everything else held (disagreed between halves, too small, or unreadable). Execute-bucket sample on 15Min is still 25 trades (<30) — see AGENTS.md Temporary overrides for the reconciled revert-trigger note.'
from learning_models
where model_type = 'score_adjustment' and version = 1;
