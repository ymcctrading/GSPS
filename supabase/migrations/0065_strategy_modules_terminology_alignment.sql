-- Realign public.strategy_modules with the code constants it is supposed to
-- mirror, and remove banned terminology from the seeded rows.
--
-- 0048 created this table as "the DB mirror of lib/signals/confluence/
-- registry.ts's CONFLUENCE_MODULES", and registry.ts's own doc comment claims
-- a module's id/version/authorized-source "can never drift between the code
-- that runs it and the row that documents it." Nothing enforced that, and it
-- drifted: the code constants were later renamed to satisfy the terminology
-- gate (scripts/check-banned-terms.mjs) while these rows kept the original
-- names.
--
-- The gate scans source files, so it structurally cannot see a database row.
-- That is why this sat undetected -- the seeded `display_name` values carried
-- terminology banned from user-facing copy, and would have been reintroduced
-- into every freshly-seeded environment (preview branch, restore, new
-- project) even after the production rows were corrected by hand on
-- 2026-09-17.
--
-- Values below are copied verbatim from GANN_CONFLUENCE_MODULE
-- (lib/signals/confluence/gann.ts) and SARA_CONFLUENCE_MODULE
-- (lib/signals/confluence/sara.ts). `module_id` is deliberately unchanged: it
-- is the primary key, it matches the code constant, and it is an identifier
-- rather than rendered copy.
--
-- NOTE: nothing in the application reads this table today, and nothing reads
-- CONFLUENCE_MODULES either -- the module registry and the
-- gann_evaluations/sara_evaluations audit-trail tables 0048 created are all
-- still unwired. This migration corrects the data; it does not close that
-- gap, and it does not make the non-drift guarantee real. Both are tracked
-- for the confluence-module audit.

update public.strategy_modules
set display_name = 'Structural Coordinate Confluence',
    authorized_source = 'lib/gann/squareOf9.ts, lib/gann/fans.ts, lib/gann/timeCycles.ts — independently implemented structural coordinate techniques disclosed only in the private paid correspondence course this platform is built from (docs/GANN_HISTORICAL_SOURCES.md A2.1), never sold in the ten public books; already in production use in the legacy scan scorer (lib/scanTicker.ts).'
where module_id = 'gann_confluence_layer';

update public.strategy_modules
set display_name = 'Price-Action Confirmation Confluence',
    authorized_source = 'lib/strat/patterns.ts (closed-bar reversal/continuation taxonomy: 2-2, 1-2-2, 3-2-2, 2-1-2, 3-1-2, momentum exhaustion reversal) — already-authorized, documented internal logic; display names routed through lib/education/patterns.ts''s PATTERN_GLOSSARY_TERM.'
where module_id = 'sara_sniper_confluence_layer';
