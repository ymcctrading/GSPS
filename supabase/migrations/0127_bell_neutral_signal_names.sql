-- GSPS — 0127: old bell notices take the signal names members now see
--
-- Owner, 2026-10-28 (confidential sources, top priority): nothing a member
-- can read may name the method behind a reading. The intraday signals were
-- renamed in code the same day ("Over-balance of space" is now "Largest
-- pullback of the trend", "Overnight Chart turned" is now "Daily swing
-- turned", lib/scanner/intradayDisplay.ts), but notices already written to
-- the bell kept the old names, and a member reads their own rows directly
-- (RLS select policy, migration 0067) as well as through the inbox route.
-- This rewrites those titles in place. Nothing else in a row changes, and the
-- bell's once-a-move check (lib/notifications/intradayBell.ts#isNewMove)
-- compares titles, so old and new rows now agree.
--
-- Rollback (restores the old wording; it also renames notices written under
-- the new names since, which no longer tells them apart):
--   update public.in_app_notifications
--     set title = replace(replace(title, 'Largest pullback of the trend', 'Over-balance of space'),
--                         'Daily swing turned', 'Overnight Chart turned')
--     where verdict = 'Intraday'
--       and (title like '%: Largest pullback of the trend' or title like '%: Daily swing turned');

update public.in_app_notifications
  set title = replace(replace(title, 'Over-balance of space', 'Largest pullback of the trend'),
                      'Overnight Chart turned', 'Daily swing turned')
  where verdict = 'Intraday'
    and (title like '%: Over-balance of space' or title like '%: Overnight Chart turned');
