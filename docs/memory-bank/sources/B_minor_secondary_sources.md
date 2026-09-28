# Short secondary sources: B02, B08, B09, B10a–c, B14

All are **Tier B** (secondary or interpretive). None is by Gann. They are cited only where they **point at** a Gann primary text; that primary text is now checked against the full Master Course read (A2.1).

---
## B02 — "WD Gann Number Vibrations" (forum post by "Brett", 3 pp.) — read in full
- **Claim:** reduce any number to a digital root; the 30° multiples of the circle reduce to a repeating 3-6-9 pattern. The 1/32 percentage steps (3.125 … 100) cycle through digital roots in a regular order. Numbers reducing to 9 (18, 36 … 144) are "change" points, so add 144 or its divisions to price.
- **Assessment:** the regularity is **pure arithmetic**. Multiples of 3.125 (= 100/32) cycle through digital roots because mod-9 arithmetic is periodic; 30° multiples give 3-6-9 because 30 ≡ 3 (mod 9). It is not a market discovery. This is the B2 catalog finding, reconfirmed.
- The post cites *45 Years* for "percentages… one of the greatest discoveries" (A8, unread; blocked). It recommends L. Dow Balliett's *Day of Wisdom According to Number Vibration*, a numerology book with no Gann provenance.
- **The Gann-sourced part is 144 and its divisions**, which the Master Course Ch. 13 does disclose. The digital-root framing is not his.
- GSPS: `lib/gann/digitalRoot.ts` (confluence-only). Status unchanged.

## B08 — "Vera", Dan Ferrera Square-of-Nine time method (astrofin list post, 2003, 3 pp.) — read in full
- Quotes a **"W.D. Gann Master Egg Course"** passage on time, the same doctrine as Master Course Ch. 13 and 15A:
  - measure time by the Sun and the 360° circle
  - "**always begin to count time in days, weeks and months from extreme high and extreme low levels, and not from exact seasonal or calendar time periods**"
  - day counts 45, 90, 112½, 120, 135, 150, 157½, 165, 180 ("very important for a change in trend"), 202½, 225, 240, 247½, 270, 292½, 315, 337½, 360
- Yearly divisions: ½ = 26 weeks; ¼ = 13 weeks; ⅓ = 17⅓ weeks; ⅛ = 45 days = 6½ weeks ("why the **7th week** is always so important"); 1/16 = 22½ days ≈ 3 weeks ("market movements that only run 3 weeks").
- "**When any stock closes higher the 4th consecutive week, it will go higher. The 5th week… day, week, month, or year of Ascension… fast moves.**" This matches the Master Course Ch. 10A "year divisions" rule (4th higher weekly close; 5th = Ascension). **Corroborated.**
- Method: project every count (46, 61, 91, 121, 137, 182, 227, 242, 272, 317, 333, 365 days) from **every** swing pivot of the last two years, on a 2% close-only swing filter. Dates where several projections land together = **"cluster" dates** (an Excel table covers Jan 2001 – Oct 2003).
  - ⇒ **Convergence-of-projections as the operative signal.** This matches Gann's own wheat example (Ch. 13) and his ⅓/½ coincidence rule (Ch. 14).
  - Implementation note: the **2% swing filter and the two-year lookback are Vera's parameters, not Gann's**.
- GSPS: `timeCycles.ts` projects 45/90/180/360 from pivots and treats a scan date within a window as a "date of interest". **Gap:** no *cluster count* (how many independent projections coincide). Candidate confluence enrichment.

## B09 — "A Summary of W.D. Gann's Techniques of Analysis and Trading" (anonymous, Indian-market framing, 6 pp.) — read in full
Corroboration status after the full Master Course read:
| B09 claim | Primary check |
|---|---|
| 3½ days, 7/14/21 days (14 most important), 23 days, 42→45–46 days, 49 | **Confirmed** (Master Course Ch. 14) |
| Weeks 13/26/39/17/35; ½ year most important after anniversaries | **Confirmed** (Ch. 14, 18) |
| ⅓ year from one pivot coinciding with ½ or ¼ from another | **Confirmed** (Ch. 14) |
| Square of 144 divisions (20,736 … 324) | **Confirmed** (Ch. 13). Note B09 computes the years column from **days** (56.8 yr), matching the Ch. 13 correction |
| Decade year-by-year character (years 1–10) | **Confirmed** (Ch. 7; already `decadeCycle.ts`) |
| Price as time (a high at 60 = 60 days/weeks/months), square of high, low and range | **Confirmed** (Ch. 13, 14, 18) |
| 45° angle broken = weak, regained = strength | **Confirmed** (Ch. 13, 16 Auburn) |
| "Watch for change in the 59th month"; "campaigns culminate in the 23rd month"; smallest complete cycle 5 years, minor 3 and 6 | Partly consistent (Ch. 10A: 21–23-month tops/bottoms of the 7-year cycle). The 59th month is not found verbatim. **Unverified** |
| "Nine mathematical proofs of resistance" | Not in the Master Course; attributed to *45 Years* / *How to Make Profits in Commodities* (A8). **Unverified** (blocked source) |
| "Never trade in the direction of the trend on its third day" | **Not found** in any primary read so far. Treat as B09's own rule |
| "7 week period is considered as death zone" | **Mismatch.** Ch. 15A's "death zone" is the **8th–9th sections** of the Master 12 chart, not 7 weeks. Ch. 14 calls the **7th week** "so very important". B09 conflates the two |
| RSI/AD-line/divergence remarks | Not Gann. Ignore under AGENTS.md |
| Planetary periods table | Astronomy facts, not a technique |

## B10a–c — Jason Sidney, *Analyst Insight* articles (Market Insight Pty Ltd, c. 2002–03) — read in full
- **B10a "Balancing Time Frames":** compare swing durations high→low, low→high, high→high and low→low. Examples: S&P 17 vs 18 weeks; Dow high-to-high 43 vs low-to-low 44 weeks (2001–02). This is equal-time repetition, consistent with Gann's time-equality counts (e.g. Master Course Ch. 12, "up 61 points… as much as in the 1933 campaign"). Sidney also leans on **RSI divergence** and "false breaks" as confirmation. **RSI is non-Gann: excluded.** The "close back above the old low" false break matches Gann's own closing rules (Ch. 11A signal-top logic).
- **B10b "Forecasting Time Frames Using Gann Angles":** each angle = a percentage of the swing's base time (1x1 = 100%, "1x2" = 50%, "2x1" = 200%, 1x3 = 33%, 1x4 = 25%, 1x8 = 12.5%). "Doubling the low" as a price target (SPI 1184 × 2 = 2368). ⚠ **Notation:** Sidney writes "1x2" for **2 points per period**, the reverse of the usual Gann convention (Ch. 13 "2×1… up two spaces… in one period"). Normalise before porting. `fans.ts` already cites B10 for the time-percentage mapping.
- **B10c "Aligning Time and Price":** a table mapping eighths and thirds retracements to fan angles. When a 50% price retracement arrives at 50% of the swing's time, the confluence is stronger. Consistent with Master Course Ch. 13 ("time at 72, price at 72… squared out… half-way point").

## B14 — Ric Ingram, "Proposed Mathematical Basis for the Elliott Wave" (*Cycles*, Foundation for the Study of Cycles, Mar/Apr 1994) — read in full
- Summing sine waves with **4:1 period ratios**, roughly in phase, reproduces a 1-2-3-4-5-A-B-C shape. Adding a third and fourth 4:1 harmonic nests the pattern. This implies the corrective count is 3-5-3. Asymmetric patterns can arise from symmetric components.
- **Relevance:** Elliott is **excluded** by AGENTS.md's non-Gann sweep. The transferable idea is **Tomes-style harmonic superposition**: complex swing shapes from a few integer-ratio cycles. This belongs in Part C reasoning (Dewey's "wave-shape identity" caveat: a pattern's shape can be an artefact of superposition). Not a GSPS build item.

## Three-question notes (for the group)
1. All Tier B. Use them only as pointers; every rule they carry has now been either **confirmed** in A2.1 or marked **unverified** above.
2. Dewey: B08's "cluster" dates and B10a's equal-time swings are **repetition and coincidence claims without significance testing**. B14 is the one piece that addresses **wave-shape identity** (superposition can manufacture shapes).
3. Hermetic: **Correspondence** (price ↔ time units, B09/B10), **Rhythm** (equal swings, B10a), **Vibration** (B02's number "vibration": numerology framing, not evidence).
