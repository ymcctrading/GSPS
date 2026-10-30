# AGENTS.md migration map (2026-10-30)

AGENTS.md was split on 2026-10-30 (owner's approval, "Yes, slim it") because it was
loaded into every request of every session: 305,467 bytes, about 75K tokens.

- Source: `main` at d027cb1b2e21dc8142c9ce8ca9537feaa9c69eae, AGENTS.md git blob
  f7594bffed33f51150dc8e93d7d91ccab51518a3, sha256
  28e661b4f476a6b9b399521e52f6424ef34c650d56d1160ee0dd5b22df1422ca.
- Archive, byte for byte: `docs/agents/archive/AGENTS-2026-10-29-d027cb1.md`.
- The split was checked lossless at the time: the preamble plus the 27 sections, in
  order, reproduced the original byte for byte. Each moved section is that original
  text unchanged; edits made after 2026-10-30 are in git history.
- "Verbatim" sections were kept in AGENTS.md unchanged. "Summary" sections keep
  their standing rules as a short summary in AGENTS.md, and the full text (history,
  rationale, examples) moved to the file named. The full text decides.

No text was removed: every moved section survives in full. The always-loaded summaries were
checked by a cold review against the full texts for standing rules they dropped or weakened, and
those were added back (see the PR). Two sections were added to AGENTS.md: "How this file works"
and "Context efficiency".

| # | Original heading | Original lines | Bytes | In AGENTS.md | Full text |
|---|---|---|---|---|---|
| 1 | Product Roadmap | 9-42 | 1,677 | Verbatim | AGENTS.md |
| 2 | Confidential sources — top-priority standing rule (2026-10-28, project owner) | 43-85 | 2,845 | Verbatim | AGENTS.md |
| 3 | Cross-platform consistency — standing principle | 86-129 | 2,649 | Verbatim | AGENTS.md |
| 4 | Gann & cycles research memory | 130-1461 | 103,084 | Summary | `docs/agents/04-gann-research-memory.md` |
| 5 | WD Gann precedence — standing principle | 1462-1548 | 5,572 | Summary | `docs/agents/05-gann-precedence.md` |
| 6 | Gann-grounded platform — standing principle | 1549-2245 | 46,315 | Summary | `docs/agents/06-gann-grounded-platform.md` |
| 7 | Gann-derived AND measured — standing principle | 2246-2298 | 2,869 | Summary | `docs/agents/07-gann-derived-and-measured.md` |
| 8 | The scorecard's role — recorded so it is not re-litigated | 2299-2329 | 1,740 | Verbatim | AGENTS.md |
| 9 | Hermetic principles & cycle theory — standing background lens | 2330-2422 | 6,086 | Summary | `docs/agents/09-hermetic-and-cycle-theory.md` |
| 10 | Astrology — standing decision (2026-09-16, project owner direction) | 2423-2511 | 5,443 | Summary | `docs/agents/10-astrology.md` |
| 11 | Every Gann method acts; Jensen's astrology is included — owner decisions, 2026-10-01 | 2512-2583 | 4,264 | Summary | `docs/agents/11-every-gann-method-acts.md` |
| 12 | Strategy Modes — scoped exception to the non-Gann boundary (2026-09-23, project owner direction) | 2584-2906 | 21,753 | Summary | `docs/agents/12-strategy-modes.md` |
| 13 | Forward-looking claims — standing direction (2026-09-28, project owner) | 2907-2917 | 693 | Verbatim | AGENTS.md |
| 14 | Three-question mandate — the lens work is reasoned through, every session | 2918-3075 | 10,202 | Summary | `docs/agents/14-three-question-mandate.md` |
| 15 | The Law of Creation — fourth question of the mandate (2026-10-21, project owner) | 3076-3094 | 1,262 | Verbatim | AGENTS.md |
| 16 | Cycles as architecture, not only scoring — standing direction (2026-09-23, project owner) | 3095-3146 | 3,345 | Summary | `docs/agents/16-cycles-as-architecture.md` |
| 17 | Three-path tier promotion (2026-09-25, project owner direction) | 3147-3282 | 8,730 | Summary | `docs/agents/17-tier-promotion.md` |
| 18 | Setup cards, MTP and the intraday refresh budget (2026-09-30, project owner) | 3283-3869 | 46,794 | Summary | `docs/agents/18-setup-cards-and-intraday.md` |
| 19 | Polarity audit: a genuine second pole for Novice/Pro, not a subtracted one (2026-09-23, project owner direction) | 3870-3966 | 6,484 | Summary | `docs/agents/19-polarity-audit.md` |
| 20 | Temporary overrides — mandatory, check on every session | 3967-4101 | 10,047 | Summary | `docs/agents/20-temporary-overrides.md` |
| 21 | Speed is a product requirement, not a platform ceiling — standing direction (2026-09-25, project owner) | 4102-4123 | 1,176 | Verbatim | AGENTS.md |
| 22 | Deployment (Vercel) | 4124-4130 | 1,532 | Verbatim | AGENTS.md |
| 23 | Verify before you report — standing rule (2026-10-22, project owner) | 4131-4157 | 1,670 | Verbatim | AGENTS.md |
| 24 | Code review before every merge — standing mandate (2026-10-21, project owner) | 4158-4196 | 2,438 | Verbatim | AGENTS.md |
| 25 | GitHub Actions minutes: how every session works on the free tier (2026-10-28, owner) | 4197-4239 | 2,828 | Verbatim | AGENTS.md |
| 26 | Usage limits: alerts and the 99% hold (2026-10-28, owner) | 4240-4276 | 2,603 | Verbatim | AGENTS.md |
| 27 | Git / PR Workflow | 4277-4285 | 1,011 | Verbatim | AGENTS.md |

Lines 1-8 (the Next.js note and the title) stayed at the top of AGENTS.md.
