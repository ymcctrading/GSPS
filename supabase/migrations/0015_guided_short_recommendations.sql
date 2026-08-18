-- Guided Decision Mode: allow short recommendations.
--
-- Why this exists
-- ---------------
-- `guided_recommendations.side` was pinned to 'buy' by a check constraint when
-- the mode launched. That was not caution for its own sake: short entries were
-- unbracketed at the time, so a recommended short would have carried no
-- enforced stop, and the constraint made the application's long-only rule a
-- property of the database rather than a line of TypeScript somebody could
-- delete by accident.
--
-- #72 removed the underlying problem — the simulator stages a short's exit the
-- same way it stages a long's, via lib/trade/exit-manager-sim.ts — so the
-- constraint now blocks a trade the rest of the system can carry out correctly.
-- Widened to both sides.
--
-- What has *not* changed is that a short still has to clear more gates than a
-- long: it must be borrowable at the broker both when the card is rendered and
-- again at submission (see lib/guided/eligibility.ts), and because a short
-- credits cash rather than spending it, the deployed-capital cap is the only
-- ceiling bounding its exposure (see lib/guided/sizing.ts).
--
-- Rollback
-- --------
-- Restore the old constraint:
--   alter table public.guided_recommendations drop constraint guided_recommendations_side_check;
--   alter table public.guided_recommendations add constraint guided_recommendations_side_check check (side = 'buy');
-- Any 'sell' rows already written would have to be removed first. Metadata
-- only; no row is rewritten by either direction.

alter table public.guided_recommendations
  drop constraint if exists guided_recommendations_side_check;

alter table public.guided_recommendations
  add constraint guided_recommendations_side_check check (side in ('buy', 'sell'));
