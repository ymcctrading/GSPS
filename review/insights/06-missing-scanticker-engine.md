# Insight 06 — The `scanTicker` Engine Is Missing

**Type:** Insight / Blocker
**Priority:** CRITICAL (nothing runs without it)

## Problem
Both API routes depend on the core engine:
```ts
import { scanTicker } from "@/lib/scanTicker";
```
…but `lib/scanTicker` **does not exist in this repository.** The repo contains
only `route.ts`, `batch-route.ts`, and the review docs. There is no `lib/`, no
`package.json`, and no Next.js app.

## Consequences
- The app **cannot run** and **cannot produce a real scan.**
- None of the substantive protocol logic can be reviewed or tested here:
  - the 0–9 score,
  - the Strat Sniper Gate,
  - the Gann structural layer (X_Base, X_Cusp, modulo-9 harmonic reduction, angles),
  - the Sara Sniper trigger logic (inside / directional / outside bars),
  - entry / stop / TP1 / master computation,
  - the `decision.outputState` field the batch route reads.

## What's needed
One of two things:
1. **The engine already exists elsewhere** — point me at the repo or branch and
   I'll add it to this session (`add_repo`) and wire it in. *(Most likely: the
   session that produced these two route files didn't commit the engine.)*
2. **The engine still needs to be written** — in which case it's the top build
   priority, spec'd by `GSPS v1.5.1.docx` (structural + tactical layers).

## Interim
To prove the API pipeline and the corrected asset list, I built a **labeled mock
engine** in `sandbox/scanEngine.mjs`. It generates deterministic *synthetic*
results — **not real market data and not the real Gann logic.** It exists only so
the test scan can run end-to-end. Do not mistake it for the production engine.

## Action
- [ ] Tell me where the real `scanTicker` lives, or confirm it must be built.
- [ ] Once available, delete `sandbox/` and wire the real engine into the routes.
