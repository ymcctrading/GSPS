# Deployment SOP — Three-Phase Adoption

This document establishes the deployment workflow for GSPS across preview, staging, and production environments. All deployments are **explicit and manual** — `vercel.json` has `deploymentEnabled: false` to prevent accidental automatic deploys.

## Environments

### Phase 1: Preview
- **Trigger**: Manual deployment of any branch to Vercel Preview
- **Duration**: Ephemeral per branch, destroyed when branch is deleted
- **Use case**: Test features on a live URL before merging to main
- **Access**: Public shareable URLs, feature-flagged to staging/prod
- **Verification**: Basic smoke tests, visual inspection

### Phase 2: Staging
- **Trigger**: Manual deployment of `main` branch to staging environment
- **Duration**: Persistent, always reflects latest merge to main
- **Use case**: Final validation before production release
- **Access**: Full feature set, production-like configuration
- **Verification**: Full CI suite, integration tests, E2E validation

### Phase 3: Production
- **Trigger**: Explicit production deploy (after staging approval)
- **Duration**: Live, serves all users
- **Use case**: User-facing app and API
- **Access**: Production Alpaca keys, real user data
- **Verification**: Post-deploy spot-checks, monitoring, incident response ready

---

## Phase 1: Preview Deployment

### When to deploy to preview
- Testing a feature branch before opening a PR
- Demonstrating work to stakeholders
- Testing integrations with external APIs
- Validating UI/UX changes

### Deploy steps
1. Push your branch to origin: `git push -u origin <branch-name>`
2. Request preview deploy with branch name
3. Vercel generates a preview URL: `https://<branch-name>.<project>.vercel.app`
4. Test the feature on the live URL
5. When branch is deleted, preview automatically tears down

### Verification checklist
- [ ] App loads without errors
- [ ] Core navigation works
- [ ] Authentication flow succeeds
- [ ] Market data endpoints respond
- [ ] No console errors in browser DevTools

---

## Phase 2: Staging Deployment

### When to deploy to staging
- After PR is merged to `main`
- Before any production release
- To validate full CI suite passes on merged code
- For final integration testing

### Deploy steps
1. Confirm PR is merged to `main`
2. Request staging deployment with commit SHA or `main` reference
3. Staging URL: `https://staging.gsps.vercel.app` (or configured staging domain)
4. Run full validation suite against staging
5. If validation fails, revert the offending commit on main and re-deploy

### Verification checklist
- [ ] All 103+ tests pass locally (already gated by CI)
- [ ] `npx eslint` clean (no new lint errors)
- [ ] Build completes without errors: `npx next build`
- [ ] Market scan cron `/api/market-scan` responds with auth header
- [ ] Portfolio API `/api/portfolio` returns account data
- [ ] Paper trading order submission works end-to-end
- [ ] Database migrations applied (Supabase schema current)
- [ ] Environment variables all present (no missing keys)
- [ ] Alpaca paper trading connection works
- [ ] SnapTrade integration present (if keys configured)

### Rollback from staging
If staging deployment fails:
```bash
# 1. Identify the offending commit
git log --oneline main | head -10

# 2. Revert it
git revert <sha>
git push origin main

# 3. Request re-deployment to staging
```

---

## Phase 3: Production Deployment

### Prerequisites
- Staging deployment is passing all verification checks
- Code review approval (if required)
- Any schema migrations have been tested on staging
- Incident response team is aware (if applicable)

### Deploy steps
1. Confirm staging is healthy and verification checklist is complete
2. Request production deployment with `main` reference or commit SHA
3. Production URL: `https://gsps.vercel.app` (live user-facing app)
4. Run post-deploy spot checks (see below)
5. Monitor error rate and cron job execution for 30 minutes

### Post-deploy spot checks (5–10 minutes after deploy)
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

### Automatic rollback (safest, fastest)
If a production deploy has a critical issue:

**Option 1: Revert code and re-deploy**
```bash
# 1. Identify the bad commit
git log --oneline main | head -5

# 2. Revert it
git revert <sha>
git push origin main

# 3. Request production re-deploy
# (Vercel will build the reverted code, which is now the latest on main)
```

**Option 2: Promote previous build directly (fastest)**
Use Vercel dashboard → Project → Deployments → select a known-good production build → "Promote to Production". This skips code rebuild and goes live in seconds.

### Rollback checklist
- [ ] Identify root cause (code bug, config issue, external API problem)
- [ ] Notify team if customer-facing impact
- [ ] If external API issue (Alpaca, Supabase down): monitor status pages, no code rollback needed
- [ ] Re-run post-deploy spot checks after rollback
- [ ] Post-incident review: prevent similar issues in future

---

## Deployment Request Template

When requesting a deployment, provide:

```
**Environment**: [Preview / Staging / Production]
**Branch/Commit**: [branch-name or commit SHA]
**Verification**: [link to passing CI / checklist completion]
**Reason**: [why this deploy is needed]
```

Example:
```
**Environment**: Staging
**Branch/Commit**: main (sha: a1b2c3d)
**Verification**: All tests passing, PR #17 merged
**Reason**: Deploy trade_logs population work before production release
```

---

## Environment Configuration

### Preview
- Uses branch-specific Vercel deployment
- Inherits `env` from `vercel.json` + Vercel project settings
- Can override with preview-specific env vars if needed
- Auto-destroyed when branch is deleted

### Staging
- Permanent deployment to staging domain
- Uses production-like config (same API keys, full feature flags)
- Can use subset of real data (separate Supabase branch if desired)
- Separate Alpaca paper trading account recommended

### Production
- Permanent deployment to production domain
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
3. Update `vercel.json`, commit, deploy (no automatic deploy, so cron doesn't attach until you request production deploy)

---

## Troubleshooting Deployments

### Deploy appears stuck / no URL generated
- Check Vercel project dashboard for build logs
- Confirm `vercel.json` is valid JSON (check syntax)
- Verify branch exists and has commits beyond main

### Cron doesn't fire after deploy
- Confirm production deployment is live (check Vercel dashboard, current build)
- Confirm `CRON_SECRET` is set in Vercel project env vars (not in `.env.local`)
- Cron runs only when prod deploy is active; preview/staging deploys don't trigger crons

### Post-deploy tests fail
- Re-run tests locally first: `npm test`
- Check environment variables in staging/prod are correct
- Confirm Supabase project isn't paused (free tier pause-on-inactivity)
- Check Alpaca account status (paper vs. live key mismatch)

---

## Future Enhancements

- [ ] Automated staging validation (post-deploy test suite)
- [ ] Slack notifications on deploy completion
- [ ] Deployment approval workflow (team sign-off before prod)
- [ ] Performance benchmarking (compare before/after metrics)
- [ ] Database backup before production deploys
- [ ] Canary deploy strategy (gradual rollout to percentage of users)
