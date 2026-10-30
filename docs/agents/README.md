# docs/agents — the full text behind AGENTS.md

AGENTS.md is loaded into every Claude session, so it keeps only the standing rules.
Each file here is a section of the original AGENTS.md in full: the rule, its dated
history, rationale and worked examples. No session loads these on its own; read the
one that matches the area you're working in. Where a file says "above" or "below",
it means the original order; find the named section by its heading (`grep -rn` here).

New dated history goes at the end of the matching file here, never in AGENTS.md.

| File | Read it when |
|---|---|
| `04-gann-research-memory.md` | touching any Gann rule, factor, STRATEGY_VERSION, replay or diagnosis |
| `05-gann-precedence.md` | deciding whether a question goes to the owner, or porting a Gann figure |
| `06-gann-grounded-platform.md` | touching non-Gann techniques, indicators, entry pricing, or an audit outcome |
| `07-gann-derived-and-measured.md` | adding, retiring or diagnosing a scored criterion |
| `09-hermetic-and-cycle-theory.md` | designing Gann-adjacent work or any cycle claim |
| `10-astrology.md` | touching astrology, planetary averages or Jensen |
| `11-every-gann-method-acts.md` | deciding where a Gann method acts |
| `12-strategy-modes.md` | touching Strategy Modes, custom scripts or the order ticket's techniques |
| `14-three-question-mandate.md` | designing any product-facing feature |
| `16-cycles-as-architecture.md` | designing a cron, rotation, rescan or retry |
| `17-tier-promotion.md` | touching tiers, promotion, graduation exams or promotion billing |
| `18-setup-cards-and-intraday.md` | touching setup lists, the intraday scanner, alerts, notices, email or reports |
| `19-polarity-audit.md` | gating a feature by tier, or writing curriculum |
| `20-temporary-overrides.md` | touching the data delay, notifications' freshness, the timeframe, thresholds, weights or risk policy |

`MIGRATION_MAP.md` lists every original section and where it went; `archive/` holds the original file byte for byte.
