# Where to look: sources, reading records, research and data

Standing rule (owner, 2026-11-07: "Make sure every session knows where to look for all files
moving forward"). Before you call any book, letter or file unread, partly read or unrecorded,
or before you build or test a Gann rule, look in **every** place below. A connector read that
stops early is not evidence that a book is unread. The Drive reader cut the 464-page
Master Course off at about page 74 on 2026-11-06. A session took that to mean Chapters 4–19
were unread, although they had been read and saved on 2026-09-27.

## 1. The reading records (the memory bank of what has been read)

There are two, and both cover the whole collection. Use them first.

| Where | What | How to use it |
|---|---|---|
| `docs/memory-bank/sources/` (repo) | One file per work: A = Gann's own (A01–A13, A2_1–A2_3), B = secondary (B01–B19), C = cycles (C01–C07), H01 = Hauck. Each opens with a **Read status** line | The rules, with page references. `A2_1_master_stock_market_course.md` (172 KB) is the whole Master Course, Ch.1–19B |
| `docs/memory-bank/reading-log/` (repo) | Page-by-page logs of picture pages and pages viewed | Coverage claims come from here, page by page |
| `docs/GANN_HISTORICAL_SOURCES.md` (repo) | The index: every source, its tier, its catalogue id | Find a work's id, then open its `sources/` file |
| `docs/memory-bank/GANN_CYCLES_HERMETIC_MASTER_REPORT.md`, `GANN_PARITY_ROADMAP.md` | The synthesis and the rule-by-rule parity plan | Navigation, not evidence |
| `/mnt/project-files/literature-reading-output/external/checkpoint_v7/unzipped/literature-reading-output/` | The second reading pass (2026-10-15/16): `manifest.json` (47 works W001–W047, status and gaps), `inventory.csv` (Drive ids), `works/W###/detailed-notes.md` and `coverage.json` | A second set of notes for each work, with its own coverage record |
| `/mnt/project-files/private-research/gsps2-gann-core/10-reading-verification.md` | The 2026-11-07 check of both records against Drive, work by work | Shows which A id matches which W id |

**A id to W id, for the main Gann books:**

| Work | A id | W id |
|---|---|---|
| Master Course | A2.1 | W023 (W024 duplicate) |
| Truth of the Stock Tape and Wall Street Stock Selector | A02/A04 | W005 |
| Tunnel Thru the Air | A03 | W022 |
| New Stock Trend Detector | A05 | W011 |
| Commodities | A08 | W001 and W004 |
| 45 Years in Wall Street | A09 | W009 |
| Magic Word | A10 | W026 |
| Economic Forecaster | A11 | W010 |
| Annual Forecasts | A2.2 | W031 |
| Master Chart workbook | B12 | W036 |

A01, A07, A12, A13, A2.3, B16–B19 came after the W numbering, so they have no W id.

## 2. The source files themselves (owner's Google Drive)

| What | Drive |
|---|---|
| Folder "WD Gann (books)" | id `1MMoRKmq1YPspnWmsg_okqlPbcyLbf7wy` |
| Its subfolder "To Be Added to Claude on 9-15-26" | id `1PZCeE-17omXpQ1_cOqH9RVEBYXNy7CQ4` |
| **Full transcription of the Master Course** | Google Doc "Gann master-course & synthesis.md", id `1QBNvDkkpHqyCkeI4wb_ZmPwtsp5ayTQtwifHNXCRZjI`, 1.0 M characters. Its first ~160 lines are a third-party summary, not Gann's text |
| Master Course PDFs | `wdgannbook stock market course.pdf` (`1Gc2pwWwUJMpKbdshtUQIlKZPEqOlIm36`) and `wdgann method in detail.pdf` (`1WaZebnwL93SXJCFLZIcEnq83NX4s3HRG`), both 7,752,476 bytes. The PDF page is the printed page + 3 |

Large PDFs: the connector's text read truncates (about 160,000 characters) and its download
fails on big files. Use the transcription, or download the file directly, before you call any
page unread.

## 3. Research results and project state

| Where | What |
|---|---|
| `/mnt/project-files/private-research/` | Owner-private research: `gsps2-gann-core/` (the GSPS 2.0 core test), `gann-edge/`, `quant-validation/`, `mtf-*`, `rule_a*`. Each has a README |
| `/mnt/project-files/checkpoints/` | One file per long-running thread: objective, decisions, open items |
| `/mnt/project-files/owner/waiting-on-chuck.md` | Everything waiting on the owner |
| `/mnt/project-files/merge-queue.md`, `senior-code-review/` | The release train and the 2026-10-21 whole-repo review |
| `docs/agents/04-gann-research-memory.md` | Dated history of every rule change and measured result |
| `docs/experiments/registry.json`, `docs/replay-runs/` | The experiment registry and the replay outputs |

## 4. Market data

| Where | What |
|---|---|
| Alpaca, through the proxy (how to call it: AGENTS.md, "GitHub Actions minutes") | GSPS's own bars, from 2016 |
| `/mnt/project-files/private-research/gsps2-gann-core/data/yahoo-nyse-raw_full-2026-11-06.tar.gz` | Yahoo daily history for 2,739 NYSE tickers, 1962 to 2026-11-06. Survivors only |
| `lib/research/spyDailyCloses.json`, `/mnt/project-files/dow-daily/` | SPY closes and the Dow daily series |
