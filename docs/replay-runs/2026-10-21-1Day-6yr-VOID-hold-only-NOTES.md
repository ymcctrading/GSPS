# 2026-10-21 six-year daily run: VOID, do not read its figures

Run [39583863765](https://github.com/ymcctrading/GSPS/actions/runs/39583863765) (job
119167818051), `main@a0f739b`, `strategyVersion` `2026-10-21-gann-narrow-weeks-breakaway`,
large-cap 828 of 832 symbols, 1Day, 2020-10-23 → 2026-10-21, cell
`{"usePlanLevels":true,"entryRule":"reaction","exitRule":"gann"}`.

All 4,479 trades entered as "hold"; crossing 0, old level 0. That exposed a replay defect:
on daily bars the closed bar was read against the next session's plan, priced from that
bar itself, so a crossing or old level it traded into was already spent. Fixed in #386
(`STRATEGY_VERSION` `2026-10-21-replay-daily-closed-session`). Its figures (Execute +0.157 on
180, Watch +0.051 on 2,148) describe a replay that never offered two of the three entries,
so they are kept for the record only. The rerun on the fixed version replaces it.
