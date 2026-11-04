# Q3 plan: Mobile and community (Feb–Apr 2027)

Draft, 2026-10-29. Built from `ROADMAP.md`'s Q3 section, `docs/SYNTHESIZED_ROADMAP.md`
(Q3, Parts 5 to 7) and the code on `main` as it stood that day. Internal planning
document; nothing here is user copy.

Three rules shape every item:

- **Gann first.** Each item states how Gann answers it, before any design.
- **Free tier only.** Anything that needs money or one of Chuck's accounts is
  listed separately at the end, not mixed into the plan.
- **No claim without a record.** The "Forward-looking claims" and "no performance
  claims" rules hold for every community and digest surface. A leaderboard or a
  digest line that reads as a record has to rest on the measured record that Q2
  item 1 (Prove the edge) is building.

## Where Q3 starts (read on `main`, 2026-10-29)

| Q3 item in `ROADMAP.md` | Already built | Missing |
|---|---|---|
| Mobile app | The responsive layout was checked at 390px and 320px (Q1 item 7). Browser push works (`public/sw.js`, `lib/notifications/web-push.ts`); 0 browsers were subscribed on 2026-10-28 | No web app manifest, so the site can't be installed on a phone's home screen. No offline page. Not yet seen on a real phone |
| Trade journal and social | Every closed trade is in `trade_logs`, kept indefinitely (S-07). The evening digest attaches the journal workbook | No note on a trade. No sharing, no follows, no leaderboard |
| Interactive Brokers | Alpaca only (`lib/brokers/`) | Everything |
| Sector and breadth scanning | The industry group rank (`lib/gann/universeStrength.ts`, `lib/universe/industries.ts`: 821 stocks in 71 groups) and the universe rank are built and score P3(c) | No page shows the groups. No breadth reading |
| Dashboard customisation | A dark theme exists in CSS (`app/globals.css`) | No theme switch a member can find. No widget layout |
| Alternative data | Alpaca news is read for the bad-news cover (`lib/gann/badNews.ts`) | No news shown to a member. No macro calendar |
| Email and in-app analytics | The daily evening digest; the bell; the risk card and portfolio analytics | No weekly digest. Email is capped at 100 a day on the free plan (#561) |

## The plan, in build order

Each item names the owning thread where it touches another thread's area
(`SYNTHESIZED_ROADMAP.md` Part 7). Boundaries with the Gann-rules thread are
under "Boundaries" below.

### 1. An installable web app (the free mobile path)

**Built 2026-10-29 (#562):** `app/manifest.ts` and icons, an offline page in
`public/sw.js` (network first, nothing else cached), and an Install card beside
the push switch in Settings. Not yet tried on a real phone.

**Gann:** none; this is a delivery surface. **Hermetic:** Correspondence: the same
plan, verdict and levels on the phone as on the desktop, with no mobile-only
reading.

- Add `app/manifest.ts` with icons and theme colours, and keep the existing
  `public/sw.js` as the one service worker, adding an offline fallback page.
- Ask for push from inside the installed app. A phone browser only offers web
  push to an installed app (iOS 16.4 and later), which is the most likely
  reason no browser is subscribed yet.
- Check the signed-in pages on a real phone (Q1 item 7's open line), including
  the Dashboard home, which could not be rendered locally.
- Quick order entry is the existing ticket. A phone never gets a separate,
  simpler order path with different rules: placement's confirmation, the
  5-point stop cap and Gann's capital rules hold as they do everywhere.

This covers the roadmap's mobile goals (alerts, quick orders, positions, charts,
notifications) at no cost. A native app in the stores is listed under paid
items.

### 2. Notes on closed trades, and the trader's own record read back

**Gann:** keep a record of every trade and read it back to find your own good
and bad runs, and quit after 2 or 3 losses then restart small (*Truth of the
Stock Tape*, PDF 246-247, `docs/memory-bank/sources/A02_A04_truth_of_stock_tape_1923_and_stock_selector_1930.md`). The loss
series pause (`lib/risk/lossSeries.ts`) and the profit ceiling already read that
record; the member should be able to read it too.

- A note on a closed trade, written by the member: one text field on the trade
  log, member-written through `ledgerWriter`'s rules (a new column needs a
  migration, applied on Chuck's word).
- A "your record" view on the Portfolio page: winning and losing runs in a row,
  and where the loss-series pause fell. The record is the member's own; it makes
  no claim about GSPS's signals.

### 3. Sector and group view

**Built 2026-10-30:** a Groups tab on the Scanner (`components/scan/group-standings.tsx`,
`/api/groups`, `lib/scanner/groupView.ts`). Every figure comes from
`readUniverseRank` itself, one call a stock (about 15 ms for 820 stocks in 71
groups, measured on a synthetic month), from the month's stored reading the
scan already uses. Breadth counts the stocks, and the groups' middle stocks, in
the upper half of their twelve months' range. Positions and ranks only, no
pass or fail. Not yet seen on production data.

**Gann:** rank the groups before the stocks in them, and buy the strongest stocks
in the strongest groups and sell the weakest in the weakest (*Truth of the Stock
Tape* Ch. XVI-XVII; *Stock Selector* Ch. VII). The rank is built and already
scores P3(c). Q3 shows it.

- A Scanner tab listing the 71 industry groups by the members' median position in
  their year of monthly highs and lows (the same figure `groupPercentile` reads),
  each opening to its stocks in rank order. Read from the same function as the
  score, so the page and the verdict can't disagree (cross-platform rule).
- Breadth, read as Gann reads it: how many groups and stocks stand above or below
  their monthly levels, not an advance/decline indicator.
- The roadmap's put/call ratio is not Gann's, and its data is paid. It is left
  out. If Chuck wants it later, it would be a chart tool a member turns on, like
  the other indicators, and would never feed a verdict.
- No method name in any label (confidential-sources rule).

### 4. Theme switch and a choice of Dashboard sections

**Theme built 2026-10-29 (#562):** Light, Dark or Match device, kept per device
(`lib/theme.ts`, an Appearance card in Settings), applied before paint. Kept on
the device rather than in `settings.prefs`, so a phone and a desk screen can
differ. **Dashboard sections built 2026-10-30:** a Settings card shows, hides and
reorders them, saved per member in `settings.prefs.dashboard`
(`lib/dashboard/sections.ts`); the default order is the old page, Novice summary
first. The welcome banner, rest reminder and stale-scan notice stay fixed on top.

**Gann:** none. **Hermetic:** Polarity: novice and expert each get a designed view,
not a shortened list.

- Light and dark: the CSS exists; add the switch to Settings and the header, and
  store the choice in `settings.prefs`.
- The Dashboard's sections can be shown, hidden and reordered, saved per member in
  `settings.prefs`. A full drag-and-drop widget grid is held until members ask
  for it. Novice keeps the Guided-first layout as its default.

### 5. A weekly digest, by the bell and push first

**Built 2026-10-30:** after Friday's close, inside the evening journal's existing
cron (no new cron or Actions minutes): `lib/notifications/weeklyDigest.ts` and
`weeklyDigestRun.ts`. The member's own trades closed this week (count, gains,
losses, net dollars; no rate), the setups they tracked this week and where each
stands, and the groups' strongest and weakest, with the moves since last month
in the month's first digest. Bell and push always; email only when the member
turned it on and within the "digest" budget, after the day's journals.

**Gann:** he reviewed his charts weekly and judged the trend by the week's close
(the weekly chart and the green/red line, `lib/gann/weeklyOneBar.ts`). A weekly
review fits the method better than a stream of signals.

- One weekly summary: the member's own closed trades and record, the setups they
  tracked and what became of each, and the groups that changed rank.
- Delivered to the bell and push, with email only within the daily budget
  (`email-budget.ts`'s "digest" kind), so it never pushes out a member's own trade
  notices.
- It states no win rate or expectancy for GSPS's signals until Q2 item 1 has a
  measured record to link ("Forward-looking claims").

### 6. News on the symbol page

**Built 2026-10-30:** a news card on the symbol page (`components/scan/symbol-news.tsx`,
`/api/news`, `lib/news/symbolNews.ts`): up to 12 headlines from the last two weeks,
each with its publisher and link, beside the close of the session it fell on and
that session's change (after the 4 PM close it counts on the next session, as
`badNews.ts` reads it; crypto by its UTC day). Signed-in members, every tier.
Read once a symbol an hour per server instance, not once a day: a page a person
opens needs the day's headlines. The macro calendar is still held for a source.

**Gann:** he read the market's response to news, not the news itself: tops on
bullish news, bottoms on bearish (*Commodities* p. 8; W006 p. 14), which is how
`badNews.ts` reads it.

- Show Alpaca's headlines for the symbol (free with the data plan, one read per
  symbol a day as `fetchNews` does now), each beside the session's close that day.
- No sentiment score: Gann gives none, and a sentiment indicator would be platform
  substance with no source.
- A macro calendar needs a data source. Free ones exist (for example the Fed's and
  BLS's published release schedules), but each needs its terms checked before use.
  Held until a source is chosen.

### 7. Community, Gann's way

**Gann:** losses come from hope, tips and opinions; trade only on definite rules
(*New Stock Trend Detector*, `docs/memory-bank/sources/A05_new_stock_trend_detector.md`; *Economic Forecaster*, A11:
"ignore tips; follow rules"). "Follow expert traders" is a tip service by
another name, so it is not built as copying.

- Shared watchlists: a member shares a list by link, read-only. It shares symbols,
  not trades or calls.
- Discipline before results: the shared standard is Gann's (paper-trade first, the
  five qualifications, hope and fear), as the synthesized roadmap says.
- An opt-in public leaderboard is held. It is a performance claim about members'
  trading, and needs Q2 item 1's record, a compliance read and moderation first.
  If it is built later, it ranks rule-keeping (stops placed, confirmations
  waited for, the loss pause respected) before profit.
- Any member-written text (notes shared publicly, list names) needs moderation and
  anti-spam guardrails before it is public. Until then, notes stay private.

## Boundaries with the Gann-rules thread (to confirm with it)

- **Q2 item 1, Prove the edge.** Q3 builds no record and states none. Items 5 and
  7 link to that thread's measured record once it exists and show nothing in its
  place before then.
- **Q2 item 8, Track M.** The synthesized roadmap's Q3 line, "the School carries
  every rule the product shows, in our own words", stays with that thread and the
  School's owner, under the 2026-10-28 rule that the School teaches public methods
  and never names the confidential sources. Items 3 and 6 add only display.
  Neither changes a score, a level or a verdict, so `STRATEGY_VERSION` doesn't
  move.
- **Item 3** reads `universeStrength.ts` and `industries.ts` and doesn't edit them.
  The page shows the rank itself and never says or implies it passes a score
  check: since #559 a long gets P3 credit for its rank only when `longMayLead`
  holds (`lib/gann/leadership.ts`, G25), so "strongest in its group" can differ
  from what the score credits.
- Confirmed by the Gann-rules thread, 2026-10-29 04:28 UTC: the boundaries above
  are fine, and its next record is the six-year rerun after the 2026-10-29
  8 PM ET release.

## Paid items and accounts, listed apart

| Item | What it needs | What it adds over the free plan |
|---|---|---|
| Native iOS and Android app | Apple Developer ($99 a year) and Google Play ($25 once) accounts; a framework choice | Store listing, native push without installing from the browser |
| Interactive Brokers | An IBKR account, and a running Client Portal gateway or TWS, which a serverless host can't keep up; likely a small paid server | Larger accounts, a second broker |
| Schwab | A Schwab developer account and approval | A third broker |
| Resend paid tier | About $20 a month | The weekly and evening digests by email for every member past the free plan's 100 a day |
| Put/call data | A paid options-data feed | Only if Chuck wants it, as a chart tool |
| Moderation service | Optional; free tooling may be enough at small scale | Public notes and lists |

## Open questions for Chuck (no Gann answer)

1. Is the installable web app enough for Q3, or does he want the store apps (paid)?
2. Should shared watchlists be public by link, or only to members he approves?
3. Interactive Brokers: worth a small paid server to host the gateway?

## Design basis

Mandate: 1. Gann answers items 2, 3, 5, 6 and 7, cited in each; 1 and 4 are
delivery and display with no Gann content. 2. Dewey: item 5's weekly cadence is
a review interval, not a periodicity claim about markets, so the checklist does
not apply. 3. Hermetic: Correspondence (one method on every screen size),
Polarity (novice and expert views), and Cause and Effect (a member's record read
back is the cause their next trade learns from). Law of Creation: member ⊗
record is a creation, the trader seeing their own runs, which re-enters as the
loss-series pause they already live under. Community ⊗ tips would be a mixture,
which is why following is not built.
