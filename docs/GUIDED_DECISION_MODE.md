# Guided Decision Mode

**Status:** shipped, paper-only.
**Phase:** Q1 (Aug–Oct 2026) — *Reduce friction: onboarding and execution UX.*

Guided Decision Mode surfaces one recommended action per symbol, sized
correctly, and lets the user confirm it with a single tap. It is a trust
escalation from the rest of GSPS, which shows its work — score, factors,
entry/stop/TP1/master — and leaves the decision to the user. Guided Mode makes
the decision and asks the user to agree with it.

Everything below is a constraint, not a preference. Each one exists because
without it the mode would be misleading to a user who can no longer see the
numbers.

---

## What had to be true first

Guided Mode inherits every accuracy problem in the scoring and target engine and
makes each one worse, because the user is no longer looking at the raw numbers
to sanity-check them. Four things were resolved before the one-tap flow:

| Prerequisite | Resolution |
|---|---|
| The advertised reward:risk did not match the priced one | Settings and the landing page advertised 2:1 (TP1) and 3:1 (master). The engine prices TP1 at 1.5R and the master target at the asset class's runner multiple (2.5R equities, 3R crypto), stepped out to a structural level up to a 5R ceiling. All copy is now generated from the engine's own constants — `lib/trade/protocol-rules.ts` — and a test (`lib/__tests__/protocol-rules.test.ts`) fails if they drift. Guided Mode's dollar figures come from the real levels. |
| "Execute = score 7+" did not describe observed behaviour | Score 7 is necessary and never sufficient: `computeScore` holds the state at Watch with no priced trade plan, `applyReversionConfirmation` holds an unconfirmed bare 2-2, and `applyDataLagHold` holds anything computed on stale bars. That was correct behaviour described by incorrect copy. Settings now states all of it. |
| `/ticker/BTC/USD` 404'd | A crypto pair's slash made the URL two path segments against a one-segment route. Fixed upstream in #72 by a catch-all `[...symbol]` route plus `tickerHref` (`lib/routes.ts`), which every link in the app now goes through; the page rejoins the segments. Percent-encoding would not have worked — `%2F` is normalised back to a slash before the route matches. This branch added the round-trip test (`lib/__tests__/symbol-route.test.ts`) that pins the two halves together. |
| Short-side stops were not enforced at the broker | Resolved upstream in #72: the simulator stages a short's exit exactly as it stages a long's, via `lib/trade/exit-manager-sim.ts`. Guided Mode launched long-only because of this and now recommends both sides — see "Shorts" below for the three things a short needs that a long does not. |

## Eligibility

`lib/guided/eligibility.ts`. A scan becomes a recommendation only when **all** of:

- **Verdict is Execute.** Watch-tier expectancy has run slightly negative
  (-0.079R) over the period the Backtest tool covers. A Watch setup behind a
  friendly Buy button, shown to someone who cannot see the score, is misleading
  regardless of intent.
- **A direction is armed** — long or short. A short additionally has to be
  borrowable (below).
- **The trade plan is priced** — entry, stop, TP1 and master all present, with
  real distance between entry and stop, measured in the trade's own direction.
- **The symbol clears the liquidity floor** (below).
- **The data is current** — not a full execution candle or more behind.

Candidates come from the published daily list, but **only the symbol crosses that
boundary**. Every score, level and verdict on a card is re-derived from a live
`scanTicker` call at request time, and re-derived again at submission. A
recommendation whose plan has moved by more than a cent is refused rather than
placed.

## Shorts

A short is not a long with the inequalities flipped. Three things differ, and
each one is a place the mode would be wrong if it treated them as the same:

**It needs a borrow.** Alpaca will not lend every listed name. `resolveShortable`
asks per short candidate before the card renders, and asks again at submission,
because availability moves during a session. An unknown answer **fails** the
short — deliberately stricter than `filterShortable` on the market scan, which
fails *open* so the daily list does not go dark when the broker call fails. A
scan row a user reads is not an order a user taps: the worst case of a wrong row
is a bad suggestion they can see, and the worst case of a wrong one-tap Sell is
an order that dies at the broker after they have already committed.

**It consumes no cash.** The simulator moves cash by the full notional either
way, so a sell *credits* the account (`executeFill`). Sizing a short against
buying power would be arithmetic on a number that grows as the position grows,
so the buying-power ceiling simply does not apply to it. That leaves the
**deployed-capital cap as the only ceiling bounding a short's exposure**, which
is why that cap counts notional on both sides.

**It reads differently.** The reason line is written per side rather than
generated by swapping direction words — a short reversion is price failing at a
ceiling it has failed at before, not "a long, downwards". The exit sentence says
*bought back* and *trails down*. The button and badge say "Sell short" and carry
the bear colour, so a card can never read "Buy" for an order that would sell.

The sizing arithmetic itself is shared, not duplicated: a `dir` of +1/−1
multiplies every price difference, so a short's stop above its entry yields the
same positive risk-per-share a long's stop below its entry does. Tests assert
that a mirrored short produces numerically identical size, risk, reward and R
to its equivalent long.

## The liquidity floor

`lib/scan/liquidity.ts`, applied by **every** scan — the daily market scan, the
intraday scanner and Guided Mode — not only by Guided Mode:

| Asset | Floor |
|---|---|
| US equities | price ≥ $5 **and** 20-session average volume ≥ 500,000 shares |
| Crypto | 20-session average turnover ≥ $5,000,000 (no price floor) |

A symbol whose history cannot be read fails the floor rather than passing it
silently. The intraday scanner applies the price half unconditionally and the
volume half when the caller supplied daily history (the API route always does),
recording the outcome in its per-symbol audit trail.

## Position sizing

`lib/guided/sizing.ts`. Pressing Buy or Sell never sets a quantity. Five
ceilings apply and the smallest wins:

1. **Per-trade risk cap** — 1% of paper equity by default, divided by the
   entry-to-stop distance, measured in the trade's own direction.
2. **Deployed-capital cap** — no more than 25% of paper equity across open
   guided positions at once. Cards rendered together are sized against each
   other, so three cards that each fit the cap cannot breach it collectively.
3. **Buying power** — the simulated account is cash-only; no margin is modelled.
   Longs only: a short credits cash rather than spending it, so this ceiling
   does not apply to one (see "Shorts").
4. **Per-trade dollar budget** — a flat cap on notional, $250 by default and
   editable down to $50 in Settings, or off entirely. It exists because 1–3 are
   all percentages of paper equity, which defaults to $100,000
   (`STARTING_CASH`) — a number that has nothing to do with what someone
   trading real money in the low hundreds actually has to spend. A card sized
   correctly against a $100k paper account can still ask for tens of thousands
   of dollars of notional, which is accurate and useless to a novice. This
   ceiling applies to both sides, unlike buying power (see "Shorts"), and
   shows up on the card as "Capped to your per-trade dollar budget" when it is
   the one that bound the size (`Recommendation.boundBy === "budget"`).
5. **Minimum size** — at least 2 shares. The protocol exits in tranches, and a
   single share collapses that into an all-or-nothing target, which is not the
   trade the card describes. Below the minimum, the recommendation is skipped,
   not shrunk. A higher-priced symbol that a small budget cannot buy 2 shares
   of is skipped the same way — the budget cap does not need a separate
   price-band filter on the candidate list to keep novice recommendations
   affordable; sizing already does it.

The reward figure is computed from the staged exit `planProtocolExit` will
actually place (60% at TP1, the remainder at the master target), never from
`qty × (target − entry)`, which no guided trade would ever pay.

Trade-count caps — 3 new positions a day, 10 a rolling week — are counted from
the recommendation ledger in Eastern trading days, and re-counted at submission
rather than trusted from the render.

All caps live in `lib/guided/config.ts` and are editable in **Settings → Guided
Mode limits**, which writes to `settings.prefs.guided` through
`/api/settings/guided`. Anything unset, unparseable or outside the permitted
range falls back to the conservative default — a value written directly to the
row cannot widen a cap past what the mode is willing to honour. `budgetUsd` is
the one cap with a meaningful "off" state: a stored `null` disables it (sizing
on the percentage ceilings alone), while anything else invalid falls back to
the default of $250 — on, not off, because the account most likely to need it
is a fresh one that has not touched Settings yet.

## Execution

- Submits through `placeSimulatedOrder` — the same path the manual ticket uses,
  with stop, TP1 and master attached as a real bracket. Guided Mode has no order
  code of its own.
- One tap → one confirmation dialog restating symbol, side, size, risk and reward
  in plain numbers → one order. The dialog is never skipped, including for
  strong setups: the human tap is a checkpoint, and a checkpoint you can skip is
  not one.
- The disclosure sits directly above the confirm button, on the card and again in
  the dialog. Not linked, not collapsed, not dismissable.
- **No standing authorization.** A recommendation is single-use and expires after
  15 minutes. If the setup de-arms or re-prices first, it is resolved as expired
  and the tap is refused with an explanation.
- After execution the user lands on **Portfolio**, showing the new position and
  its real bracket levels — not on a screen offering the next trade.

## Hard blocks

- **A connected live brokerage disables the mode entirely**, with a message
  saying guided recommendations are paper-only. Lifting that is a deliberate
  product and legal decision for the account owner, not a default to grow into.
- The global trading kill switch (`TRADING_DISABLED`) disables it too.
- Guided Mode is **not** the Automated Portfolio Manager. That product trades
  without a per-trade human tap; this one cannot place anything without one. The
  two are deliberately not merged.

## Out of scope at launch

No unattended execution, no live brokerage execution, no options
recommendations. Short-side recommendations were out of scope at launch and are
now supported — see "Shorts" above.

## Auditability

`guided_recommendations` (migration 0013) records **every recommendation shown**,
not only the ones acted on: symbol, timestamp, score and verdict at surfacing,
the exact entry/stop/TP1/master the card was rendered from, the size and dollar
figures the user was shown, and whether they executed, dismissed, or let it
expire.

That is what makes it possible to later run the existing Backtest-style
expectancy analysis on Guided Mode's own recommendation stream — to find out
whether the simplified flow steers novices toward good outcomes rather than
assuming it. A ledger of acted-on trades alone could never separate "Guided Mode
recommends good trades" from "users happened to tap the good ones".

## Where things live

| Concern | File |
|---|---|
| Caps, defaults, disclosure copy | `lib/guided/config.ts` |
| Eligibility and re-verification | `lib/guided/eligibility.ts` |
| Position sizing and dollar figures | `lib/guided/sizing.ts` |
| Cap counting from the ledger | `lib/guided/caps.ts` |
| Candidate selection, live re-scan, card assembly | `lib/guided/service.ts` |
| Plain-English copy | `lib/guided/copy.ts` |
| Liquidity floor (all scans) | `lib/scan/liquidity.ts` |
| Protocol rule copy, generated from engine constants | `lib/trade/protocol-rules.ts` |
| Order placement, shared with the manual ticket | `lib/trade/place-order.ts` |
| API | `app/api/guided/route.ts`, `app/api/guided/execute/route.ts` |
| UI | `app/(app)/guided/page.tsx`, `components/guided/` |
