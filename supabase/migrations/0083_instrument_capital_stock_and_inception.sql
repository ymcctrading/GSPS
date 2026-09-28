-- Gann parity roadmap Stage D2 and D3 (docs/memory-bank/GANN_PARITY_ROADMAP.md):
-- the two per-symbol facts Gann reads that GSPS had no source for.
--
--   D2 (G7) — shares outstanding, his "capital stock". Volume is read against
--   it: two-thirds of the stock changing hands in one week means distribution
--   (*Wall Street Stock Selector*, 1930, Ch. VII); weekly volume "almost
--   equalling the total amount of stock outstanding" marks a plain top, and
--   the whole capital stock trading inside one range after an advance means
--   distribution (Master Stock Market Course, Ch. 12).
--   Source: SEC EDGAR XBRL (data.sec.gov companyconcept API).
--
--   D3 (G10) — the company's incorporation (or founding) date, which Gann
--   counts time from: its anniversaries, its fractions of the year and its
--   cycle years (Master Stock Market Course Ch. 7 and 14: U.S. Steel from
--   Feb 25 1901; *Tunnel Thru the Air*, 1927).
--   Source: Wikidata P571 ("inception"), matched to the SEC CIK via P5531.
--
-- Fetched once by `scripts/fetch-instrument-reference.mjs` and stored here, so
-- no scan calls either service. Global reference data: readable by any
-- signed-in user, written only by the service role, the same posture as
-- `instrument` and `instrument_profile` (0063, 0064).
--
-- `instrument_profile.float_shares` stays unset on purpose. Float excludes
-- insider and restricted holdings; Gann's figure is the whole capital stock,
-- and SEC reports shares outstanding, not float.

alter table public.instrument_profile
  add column if not exists cik text,
  add column if not exists shares_outstanding numeric
    check (shares_outstanding is null or shares_outstanding > 0),
  add column if not exists shares_outstanding_as_of date,
  add column if not exists shares_outstanding_filed date,
  add column if not exists shares_outstanding_source text,
  add column if not exists inception_date date,
  add column if not exists inception_precision text
    check (inception_precision is null or inception_precision in ('day', 'month', 'year')),
  add column if not exists inception_source text,
  add column if not exists wikidata_qid text,
  add column if not exists reference_fetched_at timestamptz;

-- The full reported history, so the backtest can read the share count that
-- was public on each replayed session (latest `filed` before it) instead of
-- today's figure. `filed` is when the number became public; `as_of` is the
-- date the filing states it for.
create table if not exists public.instrument_shares_outstanding (
  instrument_id uuid not null references public.instrument (id) on delete cascade,
  as_of date not null,
  filed date not null,
  shares numeric not null check (shares > 0),
  form text,
  accession text,
  source text not null,
  primary key (instrument_id, as_of, filed)
);

create index if not exists instrument_shares_outstanding_filed_idx
  on public.instrument_shares_outstanding (instrument_id, filed desc);

alter table public.instrument_shares_outstanding enable row level security;

create policy "instrument shares outstanding readable" on public.instrument_shares_outstanding
  for select using (auth.role () = 'authenticated');
