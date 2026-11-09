-- Neutral ids for two intraday signals (2026-11-09).
--
-- The ids `space_overbalance` and `overnight_turn` named the rule behind each
-- signal, and they reached the browser: the alert list's `type` field, the
-- intraday API's JSON, and the rows a member can read in `intraday_alerts`.
-- AGENTS.md "Confidential sources": ids a browser or a member's row can read
-- are neutral. The code now writes `pullback_record` and `daily_swing_turn`;
-- this rewrites the rows already stored.
--
-- Until this runs, `lib/scanner/storedSignalIds.ts` reads an old id as its new
-- one, so the order of deploy and migration does not matter. The update skips
-- a row whose new id already exists for the same key (the tables' unique
-- constraints), which the reader still handles.
--
-- Tables:
--   intraday_alerts.signal_id         unique (user_id, symbol, signal_id, poll_cycle_timestamp)
--   intraday_system_alerts.signal_id  unique (symbol, signal_id, poll_cycle_timestamp)
--   notification_log.signal_hash      `<symbol>-<signal>-<bullish|bearish>`, the push dedupe key
-- Nothing else stores an intraday signal id (`grep signal_id` over app/ and lib/).

update public.intraday_alerts a
   set signal_id = case a.signal_id when 'space_overbalance' then 'pullback_record' else 'daily_swing_turn' end
 where a.signal_id in ('space_overbalance', 'overnight_turn')
   and not exists (
     select 1 from public.intraday_alerts b
      where b.user_id = a.user_id
        and b.symbol = a.symbol
        and b.poll_cycle_timestamp is not distinct from a.poll_cycle_timestamp
        and b.signal_id = case a.signal_id when 'space_overbalance' then 'pullback_record' else 'daily_swing_turn' end
   );

update public.intraday_system_alerts a
   set signal_id = case a.signal_id when 'space_overbalance' then 'pullback_record' else 'daily_swing_turn' end
 where a.signal_id in ('space_overbalance', 'overnight_turn')
   and not exists (
     select 1 from public.intraday_system_alerts b
      where b.symbol = a.symbol
        and b.poll_cycle_timestamp is not distinct from a.poll_cycle_timestamp
        and b.signal_id = case a.signal_id when 'space_overbalance' then 'pullback_record' else 'daily_swing_turn' end
   );

update public.notification_log
   set signal_hash = replace(signal_hash, '-space_overbalance-', '-pullback_record-')
 where signal_hash like '%-space\_overbalance-%';

update public.notification_log
   set signal_hash = replace(signal_hash, '-overnight_turn-', '-daily_swing_turn-')
 where signal_hash like '%-overnight\_turn-%';
