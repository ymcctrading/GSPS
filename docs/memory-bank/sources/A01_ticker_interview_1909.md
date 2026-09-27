# A01 — *The Ticker and Investment Digest* interview, December 1909

| Field | Value |
|---|---|
| Tier | A (public, contemporaneous; Gann's own words quoted, plus third-party testimony) |
| Copyright | Public domain (1909) |
| Source file | Repo `docs/doctrine` copy / Drive folder, 6 pp. |
| Read status | **Read in full, page by page** (2026-09-27) |

## Summary, page by page
- **p.1:** the magazine investigated Gann after he gave "exact points at which certain stocks and commodities would sell, together with prices… which would not be touched" (e.g. NY Central at 131 ⇒ "145 before 129"). Every prediction came with an invalidation level.
- **p.2 (Gann's words):**
  - Ten years in the markets; over 90% of untrained traders lose.
  - "I soon began to note the **periodical recurrence** of the rise and fall… natural law was the basis." "**The law of vibration** enabled me to accurately determine the exact points at which stocks or commodities should rise and fall **within a given time**."
  - Nine months of research in the Astor Library and the British Museum on records back to **1820**. Harriman "worked strictly in accordance with natural law."
  - "a **periodic or cyclic law** which is at the back of all these movements… regular periods of intense activity… followed by periods of inactivity."
- **p.3:**
  - Cites Henry Hall's *Cycles of Prosperity and Depression*. The law "will not only give these long cycles… but the daily and even **hourly** movements."
  - Each stock has its own "exact vibration", which determines support and resistance.
  - "**certain phases of this law govern the rise… an entirely different rule operates on the decline**" ⇒ asymmetric up/down rules (cf. *Wall Street Stock Selector*'s Rule-of-Three 3-vs-2 asymmetry, and Ch. 10B "the market always moves down in a shorter time").
  - Stocks move independently (UP declining while US Steel advanced), and are grouped "under their proper rates of vibration."
  - "an original impulse… resolves itself into a periodic or rhythmical motion"; "properties of the elements periodically recur" (the periodic table as analogy).
  - "**Every effect must have an adequate cause… we must deal with causes. Everything in existence is based on exact proportion and perfect relationship. There is no chance in nature.**" (Faraday: "nothing in the universe but mathematical points of force.")
- **p.4:**
  - "**Vibration is fundamental; nothing is exempt from this law.**" Stocks are "centres of energy… power to attract and repel", which is why leaders "turn dead" at times.
  - Testimony from W. E. Gilley:
    - UP at 168⅛ "would not touch 169 before a good break"
    - US Steel "will run up to 58 but will not sell at 59", then broke 17 points
    - UP 184⅞ "not an eighth higher", tested 8–9 times and shorted "with a stop at 185"

    ⇒ **The characteristic Gann trade from the start: a precise level plus a stop just beyond it** (about 1 point, or an eighth).
- **p.5:**
  - The Dow top forecast to the exact August day, within 0.4%.
  - Sept 1909 wheat at $1.20 in the last hour ("If it does not touch $1.20… there is something wrong with my whole method").
  - **Audited record, October 1909:** 286 trades in 25 market days, 264 winners and 22 losers (**92.3%**), and capital doubled ten times (1,000%). Short Steel at 94⅞ "would not go to 95"; bought at 86¼ "would not go to 86" (low 86⅓). 16 orders in one day, 8 at the top or bottom eighth of the swing.
- **p.6:**
  - Gann "refused to disclose his method at any price." Forecasts for 1910 (lower until Mar/Apr 1910; May wheat not below 99¢, then $1.45).
  - Born Lufkin, Texas; age 31; "an expert Tape Reader."

## What's new vs prior catalog
- The explicit **asymmetry claim** (a different rule on the decline) in 1909.
- **Cause and effect** is framed in Gann's own words.
- The audited 92% record is **historical claim, not evidence** for GSPS. It cannot be used as a performance claim (banned-terms and forbidden-phrase rules). Its value is showing the **method's shape**: a level, a "will not trade beyond" limit, and a tight stop.

## GSPS cross-reference
| 1909 idea | GSPS |
|---|---|
| Level + "not an eighth beyond" + tight stop | `entryTrigger.ts` (swing level + lost motion); stops in `lib/strat/levels.ts` |
| Different rules up vs down | `ruleOfThree.ts` 3/2 asymmetry; nothing else is asymmetric by design |
| Each stock's own "vibration" / own cycle | Pivot-anchored time counts per symbol (`timeCycles.ts`) |
| Hourly movements obey the same law | Correspondence argument for 15Min/1Hour execution frames |

## Three-question notes
1. Tier A, public 1909; the rhetoric is Gann's, the numbers are testimony.
2. Dewey/Tomes: "periodic recurrence" and "natural law" are *claims*. No checklist item is evidenced here.
3. Hermetic: **Vibration** (explicitly Gann's master law), **Cause and Effect** ("every effect must have an adequate cause"), **Rhythm** (ebb and flow, activity and inactivity).
