-- Security advisor remediations.
--
-- Two findings from Supabase's database linter, resolved here. A third —
-- leaked-password protection — is an Auth setting rather than a schema object
-- and is recorded at the bottom of this file, because a fix nobody can find is
-- not a fix.
--
-- 1. `rls_enabled_no_policy` on learning_models / learning_coefficients /
--    learning_audit_log
--    ---------------------------------------------------------------------
--    These three are system tables. Every read and write goes through
--    `createLearningClient()` (lib/learning/db.ts), which authenticates with
--    the service role and therefore bypasses RLS entirely — no end user, signed
--    in or not, has ever been meant to touch them. RLS-on-with-no-policies
--    already denies everything, so the finding describes a table that is closed,
--    not one that is open.
--
--    The temptation is to "fix" it by adding a policy. That would be the one
--    change here capable of causing a breach: any policy that grants a row is
--    strictly more access than these tables have today. So the deny stays, and
--    what changes is that it becomes *explicit* — a policy that matches no row
--    for `anon` and `authenticated`. Effective access is identical; the
--    intent is now stated in the schema rather than inferred from the absence
--    of anything stating it, and the linter can tell the two apart.
--
--    The grants are revoked as well. That is belt and braces: if RLS were ever
--    disabled on one of these tables by accident, the table privileges alone
--    would decide who could read it, and the answer should not be "everyone
--    with an anon key".
--
-- 2. `extension_in_public` on pg_net
--    ---------------------------------------------------------------------
--    pg_net was registered against the `public` schema. In practice all twelve
--    of its functions live in the `net` schema its own install script creates,
--    so nothing callable was ever sitting on the public search path — but the
--    registration is what the linter reads, and an extension recorded as living
--    in `public` is one whose next version could put an object there.
--
--    `alter extension pg_net set schema extensions` is refused: pg_net is
--    non-relocatable (`pg_available_extension_versions.relocatable = false`).
--    A non-relocatable extension with no pinned schema can still be *created*
--    into a chosen schema, so the registration is corrected by dropping and
--    recreating it — done in a single statement pair inside this migration's
--    transaction, so a failure to recreate rolls the drop back rather than
--    leaving the database without the extension.
--
--    Safe here because nothing depends on it: no cron jobs (0007 retired the
--    last one), no database webhooks (no `supabase_functions` schema, no
--    triggers into it), no function body referencing `net.http%`, and
--    `pg_depend` reports zero dependent objects. The two tables in `net` are
--    pg_net's own request queue and response cache; both are empty because
--    nothing has ever called it.
--
-- Rollback
-- --------
-- `drop policy "service role only" on public.learning_models;` (and the two
-- siblings), `grant`s restored if anything ever needs them, and
-- `drop extension pg_net; create extension pg_net with schema public;`. All are
-- metadata changes; no application row is read, written or moved here.

-- ============ 1. Explicit deny on the service-role-only learning tables ======
do $$
declare
  t text;
begin
  foreach t in array array['learning_models', 'learning_coefficients', 'learning_audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service role only" on public.%I', t);
    -- `using (false)` matches no row and `with check (false)` accepts no write,
    -- for both roles a client key can present. The service role does not
    -- consult policies at all, so the app is unaffected.
    execute format(
      'create policy "service role only" on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      t
    );
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format(
      'comment on table public.%I is %L',
      t,
      'System table. Written and read only by the service role (lib/learning/db.ts); the "service role only" policy denies anon and authenticated explicitly rather than by omission.'
    );
  end loop;
end $$;

-- ============ 2. Move pg_net off the public schema =========================
-- Both statements run in this migration's transaction: if the create fails the
-- drop is rolled back with it, so there is no window where the extension is
-- gone. Guarded so a re-run against an already-corrected database is a no-op.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    execute 'drop extension pg_net';
    execute 'create extension pg_net with schema extensions';
  end if;
end $$;

-- ============ 3. Leaked-password protection (Auth, not schema) =============
-- Supabase Auth can check new passwords against HaveIBeenPwned and refuse a
-- known-compromised one. It is off by default and cannot be enabled from SQL:
-- it lives in the Auth service's configuration.
--
--   Dashboard → Authentication → Sign In / Providers → Password settings →
--   "Prevent use of leaked passwords"
--
--   or: PATCH /v1/projects/{ref}/config/auth  {"password_hibp_enabled": true}
--
-- Recorded here so the remediation lives with the other two rather than only in
-- a linter report nobody re-reads.
