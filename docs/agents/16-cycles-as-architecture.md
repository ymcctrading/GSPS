## Cycles as architecture, not only scoring — standing direction (2026-09-23, project owner)

The Hermetic principle of Rhythm — everything flows, out and in; a cycle
completes and *returns*, it does not complete and stop — governs how this
platform's own recurring processes are designed, not only which market
techniques get scored. This is the same "Hermetic principles & cycle
theory" section above, extended by direct project-owner instruction from
scoring criteria to the platform's architecture itself: a scheduled job
that drains a finite batch and halts is a linear model, and linear is not
how Gann's own cycle work treats the market, so it is not how this
platform's own scanning cadence should be modeled either.

**Worked example: the universe-rotation scan design**
(`lib/scan/universe-rotation.ts`, built the same session this direction was
given). The automated market scan's coarse universe was capped at the
top-250-most-active symbols every run (`FULL_UNIVERSE_TOP`,
`lib/marketScan.ts`) — a structural exclusion of most of the 766-ticker
large-cap universe from ever being looked at, not a deliberate choice (see
PR #265's platform-wide scan audit). The fix chunks the full universe and
rotates through the chunks so full coverage happens over a repeating cycle
instead of never happening at all. The rotation index is **time-anchored**
(`resolveRotationChunk`, keyed off ET wall-clock minutes via
`lib/market/session.ts#etParts`), not a stored counter that increments and
could desync — a missed or delayed cron tick still resolves to the correct
chunk on the next run, because the schedule's phase is recomputed from the
clock every time rather than carried forward as state. That is Dewey's
"phase-resumption after distortion" criterion (Part C), applied here as an
**engineering property of the mechanism**, not a claim about market data —
the distinction matters and is kept explicit in that module's own header.

**The boundary to hold, stated the same way `lib/gann/trendStrength.ts`
states its own two engineering constants:** the *shape* of the design (a
returning cycle, not a linear batch-and-halt) is Rhythm-grounded and
Dewey-informed reasoning about how to build a scheduler well. The
*specific numbers* — chunk size, rotation interval, how many chunks make a
full cycle — are engineering choices sized against the Vercel Hobby
60-second function budget and the measured per-symbol scan cost
(`FULL_UNIVERSE_TOP`'s own doc comment), not derived from any Gann source
or cycle-theory literature. Framing shapes the design. It does not source
the numbers. Do not let a future session read "time-anchored, phase-
resuming" as a claim that the rotation cadence itself is Gann-derived —
it isn't, and it doesn't need to be to be good engineering.

**Standing instruction going forward:** before designing any new recurring
platform process — a cron cadence, a rescanning loop, a rotation, a
retry/backoff schedule — ask whether a linear "run once and stop" or "drain
and halt" shape is actually right, or whether the process is naturally
cyclical (the market it serves never stops cycling either) and should be
built as a returning wheel instead. Say which, in the module's own header,
the same way `lib/gann/entryTrigger.ts` states its three-question Gann/
cycle-theory/Hermetic design basis.

