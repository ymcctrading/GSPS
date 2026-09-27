# Custom scripts — browser click-through handoff prompt

Written 2026-09-27 for a new cloud session whose environment has Custom
network access (see the domain list below). It picks up from
CUSTOM_SCRIPTS_VERIFICATION_HANDOFF.md. The prompt itself follows the rule.

---

Pick up the custom-script Strategy Modes browser verification.
CUSTOM_SCRIPTS_VERIFICATION_HANDOFF.md on main has the full checklist, and
docs/STRATEGY_MODES.md's "Production verification pass (2026-09-27)" section
records what the previous session already did. Read both first.

Already done (don't redo it):
- Migrations 0080 and 0081 are applied to production (Supabase project
  vebhpmmzxixlhujlptue). A schema audit found no other unapplied migrations.
- RLS on strategy_plugins and strategy_plugin_versions is verified.
- The test script was checked against the real library code
  (compile/evaluate/plot/backtest). It matches evaluateMaCrossover.
- PR ymcctrading/GSPS#296 (editor error handling) is merged and deployed.

What's left is the live browser click-through the previous session couldn't
do because of network policy. This environment's network access should now be
Custom, allowing:
  *.supabase.co, gsps.vercel.app, gsps.app,
  data.alpaca.markets, paper-api.alpaca.markets
(plus the default package-manager list).

1. Confirm network access before anything else. curl
   https://vebhpmmzxixlhujlptue.supabase.co/auth/v1/health and
   https://gsps.vercel.app/login. If either is refused, check
   "$HTTPS_PROXY/__agentproxy/status", tell me which host is blocked, and stop.
2. Get a browser onto /settings/scripts as a Wall Street (SYSTEM_MASTERY)
   account. Use the live site if it's reachable. Otherwise run `npm run dev`
   locally against production Supabase: get the URL and anon key through the
   Supabase MCP tools, put them in an uncommitted .env.local, and delete it at
   the end. Use Chromium through Playwright (it's pre-installed; don't run
   `playwright install`).
   - Sign up a new test account named e2e+custom-scripts-<date>@example.com
     and keep it afterwards; I want to look at it myself.
   - Check its profiles.tier. If it isn't SYSTEM_MASTERY, set it with SQL on
     that one row only.
   - Give me the email and password in chat. Never commit them.
3. Run the handoff's step 4 in the browser:
   - Create "EMA9/SMA20 crossover (test)" with the exact script in the
     handoff. Save it, reload, and re-select it.
   - Run Check levels and Run backtest on SPY. Confirm the "Evidence only,
     not a performance claim" text shows in the UI.
   - Turn the script on as a chart overlay on the AAPL chart.
   - Confirm the order ticket's "Custom script" picker lists it and that
     Check levels / Use these levels fills the manual stop and target.
   - While you're there, load /promotion and confirm it renders (0080 was
     just applied).
   - Take screenshots at each step and note any console or network errors.
4. Fix anything broken. Read AGENTS.md's "Strategy Modes" section and
   docs/STRATEGY_MODES.md before changing behaviour. Work on a claude/ branch
   and open a PR, but don't merge it unless I ask: merging deploys to
   production.
5. Report what worked, what failed, and anything confusing in the UI, with
   the screenshots. Then, in the same PR, delete
   CUSTOM_SCRIPTS_VERIFICATION_HANDOFF.md and this file
   (CUSTOM_SCRIPTS_BROWSER_HANDOFF_PROMPT.md), and add the click-through result to
   the docs/STRATEGY_MODES.md verification section and the matching AGENTS.md
   entry.
