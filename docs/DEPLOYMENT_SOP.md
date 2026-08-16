# Deployment SOP

How changes reach users in GSPS, and what to verify at each point.

> **Deploys are automatic.** `vercel.json` sets `deploymentEnabled: true`:
> pushing a branch builds a preview, and **merging to `main` deploys
> production immediately**. There is no manual deploy step and no gate in
> between — the merge *is* the release. Everything below is verification you
> perform around that fact, not permission you request.

There are two environments, because there are two things Vercel builds: a
preview per branch, and production from `main`.

## Environments

### Preview — every branch
- **Trigger**: automatic on every push to any non-`main` branch
- **Duration**: ephemeral per branch, torn down when the branch is deleted
- **Use case**: verify a change *before* it can reach users
- **Access**: public shareable URL, posted on the PR
- **Verification**: the full pre-merge checklist below

### Production — `main`
- **Trigger**: automatic on merge to `main` — the merge is the release
- **Duration**: live, serves all users
- **Access**: live Alpaca keys, real Supabase project, crons active
- **Verification**: post-merge spot checks, then monitoring

> **There is no staging environment.** A third "staging" phase used to be
> documented here, defined as deploying `main` to a staging domain for final
> validation before production. It could not work: `main` *is* production
> now, so that validation would run against a release users were already
> using, and the `staging.gsps.vercel.app` domain it named was never
> configured. Its verification checklist was the valuable part and has been
> folded into the pre-merge checklist below, where it runs against the PR's
> preview URL and can still change the outcome. See "Future enhancements" if
> you want a real one.

> **`main` has no branch protection rule.** Confirmed via the GitHub API:
> `protected: false`. Combined with `deploymentEnabled: true` above, nothing
> stops a merge to `main` — or a direct push — that never had a green run of
> the `Tests` or `Security` workflows. CI is advisory until this is turned
> on; it cannot act as a merge gate no matter how many checks are added to
> it. Fixing this requires repo admin access this codebase's tooling doesn't
> have (no MCP tool here can write branch-protection rules), so it has to be
> done by hand in GitHub:
>
> 1. Settings → Branches → Add branch protection rule → `main`
> 2. Require status checks to pass before merging; select `Unit tests` (from
>    `Tests`) and, once it's been observed running clean, `Secret scan` and
>    `Dependency review` (from `Security`)
> 3. Require the branch to be up to date before merging
> 4. Consider requiring a PR (no direct pushes) — note this also blocks the
>    admin's own direct pushes unless "Do not allow bypassing" is left off
>
> Until this is done, treat the workflows below as reviewer information, not
> as a guarantee — anyone with push access can merge past a red run.

---

## Phase 1: Preview (pre-merge)

This is the only phase where verification can still change the outcome. Once
the PR merges, the change is live.

### Steps
1. Push your branch to origin: `git push -u origin <branch-name>`
2. Vercel builds a preview automatically — no request needed
3. The preview URL appears on the PR (also `https://<branch-name>.<project>.vercel.app`)
4. Work through the checklist below against that URL
5. When the branch is deleted, the preview tears down

### Smoke checks
- [ ] App loads without errors
- [ ] Core navigation works
- [ ] Authentication flow succeeds
- [ ] Market data endpoints respond
- [ ] No console errors in browser DevTools

### Full verification
Run this before merging anything beyond a docs change.

- [ ] Test suite passes (gated by CI on the PR — confirm it's green, don't assume)
- [ ] `npm run lint` clean (no new lint errors)
- [ ] `npx tsc --noEmit` clean
- [ ] Build completes without errors: `npx next build`
- [ ] Market scan `/api/market-scan` responds with the auth header
- [ ] Portfolio API `/api/portfolio` returns account data
- [ ] Paper trading order submission works end-to-end
- [ ] Database migrations applied (Supabase schema current)
- [ ] Environment variables all present (no missing keys)
- [ ] Alpaca paper trading connection works
- [ ] SnapTrade integration present (if keys configured)

### Migrations need care here
A migration applied to the production database takes effect for the *current*
production build, not the one that merges alongside it. Applying a
constraint before the code that satisfies it has shipped breaks production in
the gap between the two — this has happened: migration `0006` made four
columns `NOT NULL` while the writer still sent nulls, and every daily scan
was rejected for days. Ship the code first, or make the migration tolerant of
both shapes.

---

## Phase 2: Production (the merge)

### Before you merge
- The pre-merge checklist above is complete
- CI is green on the PR's head commit
- Any schema migration is ordered safely against the code (see above)
- You actually intend to release right now

### What happens
1. Merge the PR to `main`
2. Vercel builds and promotes production automatically (a couple of minutes)
3. Production URL: `https://gsps.vercel.app`
4. Run the spot checks below
5. Watch error rate and cron execution for 30 minutes

### Post-deploy spot checks (5–10 minutes after the merge)
```bash
# 1. Cron job fires successfully
curl -H "Authorization: Bearer $CRON_SECRET" https://gsps.vercel.app/api/market-scan
# Expected: 200 OK, scan results returned

# 2. Market data endpoint works
curl https://gsps.vercel.app/api/quote?symbol=SPY
# Expected: 200 OK, price data returned

# 3. Dashboard loads
# Open https://gsps.vercel.app/dashboard in browser
# Expected: page loads, portfolio appears, no console errors

# 4. Authentication flow works
# Log out, log back in
# Expected: session persists, redirect works, data loads
```

### Production verification checklist
- [ ] Homepage loads without errors
- [ ] Cron `/api/market-scan` fires successfully (check Vercel dashboard)
- [ ] Market data routes respond (quote, bars, indicators)
- [ ] Portfolio API works, shows current positions/P&L
- [ ] Paper trading works: submit order, view in history
- [ ] Scanner results populate (if after market-scan cron)
- [ ] No error spikes in Vercel monitoring
- [ ] Alpaca integration healthy (check live account activity)
- [ ] Supabase connection healthy (check project logs)

### Monitoring post-deploy
- Watch Vercel project analytics for 30 minutes: error rates, response times
- Monitor Supabase project for high CPU or connection pool exhaustion
- Check Alpaca account activity for any unexpected orders
- Review cron job logs in Vercel dashboard for the next scheduled run

---

## Rollback from Production

**Option 1: Promote the previous build (fastest — do this first).**
Vercel dashboard → Project → Deployments → a known-good production build →
"Promote to Production". Live in seconds, no rebuild. This is the right first
move when the current build is itself the problem.

**Option 2: Revert in git (durable).**
```bash
# 1. Identify the bad commit
git log --oneline main | head -5

# 2. Revert it — this redeploys production automatically
git revert <sha>
git push origin main
```

Do both when the bad commit is staying out: promote to stop the bleeding,
then revert so the next merge doesn't carry it back in.

### Rollback checklist
- [ ] Identify root cause (code bug, config issue, external API problem)
- [ ] Notify anyone affected if there was customer-facing impact
- [ ] If external API issue (Alpaca, Supabase down): monitor status pages, no code rollback needed
- [ ] Re-run post-deploy spot checks after rollback
- [ ] Post-incident review: prevent similar issues in future

---

## Landing a change without shipping it

Sometimes work needs to be reviewable, or shared, without going live. Merging
is not the way to do that any more. Options, in order of preference:

1. **Keep it on the branch.** The preview URL is a real, shareable deployment
   of exactly that code. This covers most cases.
2. **Merge it inert.** Land the code behind a flag or an unreferenced module
   so the merge ships nothing user-visible.
3. **Turn deploys off deliberately.** Setting `deploymentEnabled: false` in
   `vercel.json` restores manual-only deploys. If you do this, correct
   `AGENTS.md`, `CONTRIBUTING.md`, `docs/RUNBOOK.md` and this file in the same
   PR — that drift is what made these docs wrong for four days.

---

## Environment Configuration

### Preview
- Branch-specific Vercel deployment
- Inherits `env` from `vercel.json` + Vercel project settings
- Can override with preview-specific env vars if needed
- Auto-destroyed when branch is deleted

### Production
- Permanent deployment to the production domain
- Uses live Alpaca keys, real Supabase project
- All features enabled
- Cron jobs execute against production data

---

## Cron Jobs & Scheduled Tasks

Both market-scan crons are pinned to the current production deployment:
```json
{
  "crons": [
    { "path": "/api/market-scan", "schedule": "30 21 * * 1-5" },
    { "path": "/api/market-scan", "schedule": "30 12 * * 1-5" }
  ]
}
```

- **Limit**: 2 crons max on Hobby plan (currently at capacity)
- **Frequency**: Both daily (max 1/day each on Hobby)
- **Auth**: Requires `CRON_SECRET` header (set in Vercel env vars)
- **Fallback**: If cron fails 3 times, Vercel disables it. Re-enable in dashboard.

To add a new scheduled task:
1. Check that total crons stay ≤ 2
2. If more frequent than daily needed, use external scheduler (not Vercel crons)
3. Update `vercel.json` and commit. The cron attaches when the change reaches production, which happens automatically on merge to `main` — verify it in Vercel → Cron Jobs after the deploy completes

---

## Troubleshooting Deployments

### Deploy appears stuck / no URL generated
- Check Vercel project dashboard for build logs
- Confirm `vercel.json` is valid JSON (check syntax)
- Verify branch exists and has commits beyond main

### Cron doesn't fire after deploy
- Confirm the current production deployment is the one you expect (Vercel dashboard)
- Confirm `CRON_SECRET` is set in Vercel project env vars (not in `.env.local`)
- Crons run only against production; preview deploys don't trigger them
- See `docs/RUNBOOK.md` for the `503` vs `401` distinction

### Post-deploy checks fail
- Re-run tests locally first: `npm test`
- Check production environment variables are correct
- Confirm Supabase project isn't paused (free tier pause-on-inactivity)
- Check Alpaca account status (paper vs. live key mismatch)

---

## Future Enhancements

- [ ] **A real staging environment**, if the lack of a pre-production gate
      starts to bite. The shape that works with auto-deploy on: a long-lived
      `staging` branch with its own stable preview alias, PRs merging there
      first and `staging` → `main` promoting to production. The cost is two
      merges per change, which is why it isn't set up today.
- [ ] Automated post-deploy validation (smoke suite run against production on merge)
- [ ] Slack notifications on deploy completion
- [ ] Performance benchmarking (compare before/after metrics)
- [ ] Database backup before migrations that drop or constrain columns
- [ ] Canary deploy strategy (gradual rollout to percentage of users)
