# A05 — *New Stock Trend Detector* (W.D. Gann, 1936)

| Field | Value |
|---|---|
| Tier | **Gann primary (published book)** |
| Copyright | 1936 US publication; renewal status unverified → treated as in copyright. Paraphrased; only short phrases quoted. |
| Source file | Drive: `pdfcoffee.com_1936-new-stock-trend-detector-pdf-free.pdf` (52 pp. PDF, text layer, OCR-quality typos in source) |
| Read | **Full, page by page, 2026-09-27** (all 52 PDF pages; book pp. 1–~95 + charts) |
| Prior memory-bank entry | `docs/GANN_HISTORICAL_SOURCES.md` A5 |

Page refs below are **PDF page numbers** of this scan (the book's own page numbers are given in its contents: Ch. I p.1, II p.7, III p.12, IV p.27, V p.33, VI p.69, VII p.82, VIII p.88).

## Structure
I. A New Deal in Wall Street · II. Foundation for Successful Trading · III. History Repeats · IV. Individual Stocks vs. Averages · V. New Rules to Detect Trend of Stocks · VI. Volume of Sales · VII. A Practical Trading Method · VIII. Future Trend of Stocks. Charts: Douglas Aircraft monthly 1928–35; United Fruit weekly 1935; Corn Products weekly 1933–35; U.S. Smelting monthly 1924–35; National Distillers monthly 1925–35; United Fruit vs. Chrysler 1935.

## Ch. I — A New Deal in Wall Street (pp. 4–6)
- Rationale for new rules: SEC-era law (wash sales banned, specialist restricted, short selling curtailed, higher margin, higher taxes) changed market *action*; "a wise man changes his mind" — rules must be updated when conditions change. **Design implication:** Gann himself treated his rules as versioned against market structure — precedent for GSPS re-deriving thresholds when the market regime/data changes, not for abandoning the rule.
- Prediction (p.6): high margins (40–60%) make holders sit longer, then everyone sells at once → future declines faster, bids/offers far apart. Thin short interest removes cushion.
- Supply & demand is the only price driver; all buying/selling is "recorded and registered in the price" — price/volume record is the primary data (tape-reading premise). The trader should be a "Wall Street detective" reading supply/demand from published high/low/volume.

## Ch. II — Foundation for Successful Trading (pp. 6–9)
- Losses come from trading on hope, tips, opinions, guessing, and not admitting one can be wrong → need "definite rule or plan."
- **Stop loss 1, 2 or 3 points away** from entry, placed with the broker at entry (protects when absent / sudden events). (p.7)
- Study a stock's *past action* — the best forecaster of its future.
- "Definite plan": first **prove the rules to yourself**, then follow them. (Gann's own validation-before-trust principle → aligns with GSPS "measured" gate.)
- **Five qualifications for success** (p.8): 1 Knowledge (30–60 min/day study for 5 years); 2 Patience (wait to get in right; wait for a change in trend before closing/taking profits); 3 Nerve (knowledge gives nerve); 4 Good health (never speculate in bad health — quit and recover); 5 Capital (small capital fine *if* stops, small losses, no overtrading).
- "Never buck the trend" — detect trend, go with it regardless of hope/fear. Cross-ref: "Twenty-four Never-failing Rules," *Wall Street Stock Selector* pp. 18–19 (A4).
- **GSPS relevance:** the five qualifications map to Novice UX/education (School Foundations), and "good health → stop trading" is a spec'd analogue of the cooldown/circuit breaker (`lib/risk/cooldown.ts`): Gann's rule is *stop when your state is impaired*, independent of P&L.

## Ch. III — History Repeats (pp. 9–?)
Core statement (p.9): the future repeats the past; it is "the working out of a natural law and the balancing of time and price… action in one direction and reaction in the opposite direction." War starts/ends produce panics then booms — study action around war beginnings/endings.
**Method:** tabulate *elapsed time* between tops and bottoms (months), the longest bull campaign and longest panic, then use the historical range of durations as time windows for the current campaign.

### Gann averages chronology (tops/bottoms with durations) — data Gann tabulates
- 1856–1874 (Gann's own averages): Feb 1856 high 95½ → distribution; Jan 1857 high 92 → Oct 1857 panic low (−58 pts in 6 mo). Mar 1861 low 48 (last low before Civil War boom) → Apr 1864 high 155 (36 months, never declined more than **two consecutive months**). 1865 Mar low 88 (−67 in 11 mo). Apr 1867 low 104 → Jul 1869 high 181: 17 mo from 1867 low, 50 mo from Mar 1865 low, **99 months from the 1861 low (8 yrs 3 mo) — "the most important time period"**; last boom stage 29 months. 1869 top → Nov 1873 low 84 (−96 pts, **52–53 months**), with rallies of 9, 6 and 2 months (the short 2-month rally = weak market; like 1931–32).
- 12-industrial averages 1875–1896: 1877 Oct low 36 after 16 months of decline with little rally; Aug 1879–Jun 1881 bull 22 months; Jun 1881–Jun 1884 bear **36 months** with only a 2-month rally; Jan 1885 **double bottom at 42**; May 1887 top (34 mo from 1884 low); Apr 1888 low; Jan 1890 **triple top at 63** "selling level"; Dec 1890 low; Jan 1893 high 72; Aug 1893 low (−32 in 7 mo); Jun 1895 high (22 mo, a bear-market rally); **Aug 1896 low 29 (Bryan silver panic), 43 months from Jan 1893 top.**
- Dow 1897–1935: 1899 Apr & Sep double top 78; 1901 Jun high 78 = **third top → end of bull**; Oct–Nov 1903 low 42½ (28–29 mo from 1901 top); Jan 1906 high 103 (27 mo from 1903 low, **never reacted more than 2 months = strong bull**); Mar 14 1907 "silent panic" (−20 pts in a day); Nov 1907 low 53 (22 mo from 1906 high); Oct 1909 high 101 (23 mo, never reacted >3 mo); Jul 1910 low 73; Sep 1911 low 73 (= double bottom); Oct 1912 high 94; Jun 1913 low 53 — **"third time at the same level… always indicates an advance should follow as long as third bottom is not broken"**; Dec 1914 low 53½ (= 1907 low); Nov 1916 high 110 (23 mo); Dec 1917 low 66 (13 mo); Nov 1919 high 119½ (23 mo, no reaction >3 mo); Dec 1920 low 66 (= 1917); Aug 1921 low 64 — **"not 3 points under" the prior two lows = support → bull market follows** (the **3-point rule** as a double/triple-bottom tolerance); Mar 1923 high 105; May 1924 low 89 (start of Coolidge bull); Jan 1925 crossing 120 (1919 high) on heavy volume → much higher; Feb 1926 high 162; Mar 1926 sharp break to 136; after that no reaction >2 months until 1929; **Sep 3 1929 top 386** — 97 months from 1921 low (compare 99 months 1861–1869), 71 from 1923, 64 from 1924, 42 from Mar 1926, 35 from Oct 1926.
- **Long cycle:** 1896 → 1929 = a **33-year** long-trend business cycle with each campaign making higher prices.

### Rules extracted from Ch. III (so far)
1. **Duration-of-reaction rule (trend strength):** in a strong bull market no reaction lasts more than **2 months** (sometimes 3); in a strong bear no rally lasts more than ~1–2 months. A rally that "could not rally one full month" shows weakness (Jun 1931). → A *time-based* trend-strength test: count consecutive counter-trend months.
2. **Double/triple tops and bottoms:** a third test of the same level is decisive; a third bottom not broken ⇒ advance; tolerance ≈ **3 points** (1921 low "not 3 points under" prior lows).
3. **Old tops become bottoms; old bottoms become tops** (p.13, June 1931: Dow fell to 120 = Nov 1919 top → rally; then Nov 1931 rally stopped at the June 1931 bottom → selling under the old bottom).
4. **Crossing an old major top on heavy volume** ⇒ much higher prices (Jan 1925 crossing 1919's 120).
5. **Time-window forecasting from historical campaign lengths:** list past bear-market durations after war booms (1869–73: 53 mo; 1871–73: 30; 1881–84: 36; 1893–96: 43); greatest ≈43 months, smallest ≈12; clusters around 27, 30, 34, 36–43 months ⇒ from Sep 1929, watch for bottom around month **30–36** and again **40–43**. (The actual low, Jul 8 1932, was month 34.)
6. **Secondary rally tops** are always important points to watch; a *second* rally that is shorter in time and smaller in points than the first confirms the main trend down (Apr 1930: +99 pts in 155 days; Feb 1931: +41 pts in 69 days).

### 1929–1932 bear market sections (p.13)
- Sec. 1: Sep 3 → Nov 13 1929, 386 → 198, −188 pts in **71 days** (fastest ever).
- Secondary rally to Apr 17 1930: 297, +99 in **155 days**, volume decreased into top.
- Sec. 2: Apr 17 → Dec 17 1930: 297 → 155, −142 in 244 days (8 mo).
- Rally to Feb 24 1931: 196, +41 in 69 days (weaker = trend down).
- Sec. 3: Feb 24 1931 → …: broke Dec 1930 lows in Apr 1931; Jun 2 1931 low 120 (= Nov 1919 top) → rally to Jun 27 157½ (+37½ in 25 days); Oct 5 1931 low 85½ (−72 in 100 days); Nov 9 1931 rally to 119 (= Jun 2 bottom → resistance).
- Nov 9 1931 rally = +35 in 35 days (price = time, equal points and days); Dec 17 1931 low 72, **exactly one year** from Dec 1930 low; Jan 5 1932 low 70 (57 days; 192 days from Jun 27 1931) ended Sec. 3. Rally to Mar 9 1932: +19½ in 64 days — "very feeble rally for the time required" ⇒ liquidation not done (**points-per-time as strength test**).
- Sec. 4: Mar 9 → **Jul 8 1932, 121 days, −49 pts** (≈ same points as Nov 1931–Jan 1932 leg — **equal-points legs**). Max rally in final leg only 7 pts; each decline shorter and on less volume ⇒ liquidation ending. Last leg Jun 16–Jul 8 = 11 pts.
- **Jul 8 1932 low 40½: 34 months from 1929 top, 27 months from Apr 1930 top.** Same level (40½) as the Apr 1897 low from which the real bull market started → **old-level repetition**.

## 1932–1935 bull market (pp. 14–15)
- Sec. 1: Jul 8 → Sep 8 1932: +40 in 62 days, heavy volume, *could not go higher in the third month* ⇒ first rally only; secondary decline must follow.
- Secondary decline → Feb 27 1933 low 49½ (−31 in 172 days), 9 pts above 1932 low; tiny volume; bank holiday. "When news is the worst, it is time to buy"; bull markets begin in gloom and end in glory.
- Sec. 2: Feb 27 → Jul 17 1933: 110½, +61 in 141 days; **12 months from Jul 1932 low** — rule: *"always watch for a change in trend one year, two years, etc., from any important top and bottom."* Volume May–Jul 1933 larger than at the 1929 top ⇒ **enormous volume = culmination/top sign.**
- Reaction → Oct 21 1933 low 82½ (−28 in 96 days), small volume; only 2 pts under Jul 21 1933 low and did not reach Sep 1932 top (81½) ⇒ main trend still up (**old top = support**).
- Sec. 3: → Feb 5 1934 high 111½, one point above Jul 1933 top = **double top on large volume (5 M shares/day)**; failed to go through 112 ⇒ top. 19 months from 1932 low, 4 from Oct 1933.
- Reaction → Jul 26 1934 low 84½ (−27 in **171 days — same length as Sep 1932→Feb 1933 reaction (172 d)** ⇒ **time repetition**); 3 M shares volume; 2 pts above Oct 1933 low ⇒ bottom.
- Sec. 4: → Nov 20 1935 high 149½ (+65 in ~16 months; 40 mo from 1932 low, 33 from Feb 1933, 25 from Oct 1933). Largest reactions 12 pts and lasting only one month ⇒ trend up; after Mar 18 1935 no reaction >8 pts or >2 weeks. Oct–Nov 1935 volume 104 M shares ⇒ at least temporary top.
- Forecast (Dec 31 1935): Dow will not cross 150; a decline to 138 would indicate 120, possibly 112 (old 1933–34 top). Trade individual stocks, not the average.
- **Time periods to watch (p.15):** Jan 1936 = 42 months from 1932 low; Mar 1936 = 37 months from Feb 1933 low; Jul 1936 = 36 months from 1933 top and **48 months** from 1932 low. ⇒ Gann's worked method: from each major top/bottom count months, flag the **12, 24, 36, 42, 48** anniversaries (plus historical-range windows) as change-in-trend dates.

### Cause of the 1929–32 panic (pp. 15–16) — behavioural rules
- Averaging down is "the worst thing any trader can do." **"Average your profits, but never average a loss."**
- Buying because a stock is "down 100 points" (looks cheap) is the worst reason to buy — no change in trend had occurred and "the time period had not run out." ⇒ price-distance-from-high is **not** a buy signal; buy only on trend change + time.
- Hope → despair → capitulation selling; the buyers at the bottom were those who sold in 1928–29 and waited with cash.
- Old leaders do not return to old highs driven by mania; **new leaders** will cross their 1929 highs.

## Ch. IV — Individual Stocks vs. Averages (pp. 16–19)
- With 1,200+ listed stocks, the 30 Industrials/20 Rails no longer represent the market; trend is **mixed** (some stocks up, others down; utilities made new lows in 1935 while Dow +80). ⇒ **Rule: apply trend rules to each individual stock; do not trade from averages.** (GSPS scans individual symbols — consistent; `lib/marketScan.ts` macro breadth is only a context filter, which is consistent with Gann *as long as it never overrides an individual stock's own trend.*)
- Group ≠ stock: Curtiss-Wright A vs Douglas Aircraft (1932–35). Pick the stock making **higher bottoms and higher tops** and **crossing its prior year's top**, not the former leader stuck in a narrow range.
- **Dow Theory declared obsolete** (p.17–18): rails failed to confirm industrials repeatedly (1916, 1919, 1921, 1925, 1935); waiting for confirmation missed 50–75-pt moves. ⇒ Gann explicitly rejects index-confirmation gating. (Design note: any GSPS rule that requires an index/sector to confirm before an individual Gann signal is valid runs *against* Gann.)
- Change with the times: industries rise and fall (stage coach → canals → rails → autos → airplanes); trade the *new* leaders.

## Ch. V — New Rules to Detect Trend (pp. 19–?)
- The older books' rules remain valid "for 100 years"; under new conditions stocks move slower and on smaller volume.
- Supply/demand is the mechanism; manipulators leave "clues" in price action — "what one man's mind can devise, another can figure out… human nature never changes."
### Best charts to detect trend (p.19)
1. **Monthly high-low chart** — best for the main trend.
2. **Weekly high-low chart** — next best guide to the real trend.
3. **Daily high-low chart** — good only when the market is fast and active on large volume.
- Strong position: gradual absorption → support at higher levels → **higher bottoms and higher tops**. Turning down: **lower tops and lower bottoms**, and **breaking below the point from which the last run-up to the top began** = main trend down. (Precise swing rule: the trend turns when price breaks the origin of the final leg.)
### What to trade (p.20)
- Active stocks that follow rules and trend. Leave "queer acting" stocks alone. Avoid stocks in a long narrow range until they break out (up) or break bottoms (down) **with increased volume and activity**.
### Where to buy and sell — the 3-point rules (p.20)
- Buy near a **single, double or triple bottom**, stop **≤3 points** below.
  - *Single bottom:* after a reaction, wait until the stock **holds a level for 2–3 weeks**, buy, stop 3 pts under the **lowest week**; in active markets, holds 2–3 **days** → stop ≤3 pts under the **lowest day**.
  - *Double bottom:* same level weeks/months/a year+ apart. *Triple bottom:* third time.
- **Breakout rule:** when a stock crosses an old top **by 3 points**, if it is going higher it should **not react back 3 points below the old high**; buy on a 1–2-pt reaction, stop 3 pts under the old top.
- After a bull market starts: buy reactions, stop 3 pts under the previous support.
- **Crossing the top of a previous year by 3 points = buy on any reaction.** (Douglas: crossed 1932/33 double top 18⅝ in 1934 → 28½; after crossing 28½ in 1935 it never reacted below 26½; reactions lasted only ~2 days, never 3; crossed 1929 high 45½ → pyramid → 58⅜.)
- **Mirror for shorts:** sell against single/double/triple tops with stop ≤3 pts above, or after distribution **break the last important bottom by 3 pts**, sell a small rally, stop 3 pts above the old bottom. Breaking the bottom of a previous year by 3 pts = short sale. In a bear market, after breaking an old bottom by 3+, it should not rally 3 pts back above it (United Fruit 1935: broke 81, never rallied 3 above, fell to 60½).
- Wait for as sure an indication as possible; don't trade from impatience. "Never too high to buy while trend is up (with a stop); a short sale at any price while trend is down."
### Price level at which fast moves start (pp. 22–23)
- Moves accelerate above **50**, faster above **100**, very wide above **150 and 200** per share. On the way down, the first **50–100 points off the top** fall fastest; below 100 moves shrink, below 50 smaller still; "the lower they get, the less they rally." ⇒ volatility scales with price level (Gann's pre-percentage way of expressing proportional volatility — **GSPS translation:** normalise by price/ATR, which `lib/gann/timePriceSquare.ts` already does; do not port absolute point sizes).
### Time to hold after entry — the 1-day/3-day test (p.23)
- If the trade closes **against you the first day**, you are apt to be wrong. If it closes against you the **third successive day**, you are wrong "nine times out of ten" — **exit immediately.**
- If it closes with a profit the first day and **still shows a profit after three days**, you are almost surely with the main trend — hold.
- ⇒ **Concrete, implementable post-entry validation rule** (a time-based invalidation distinct from the stop). *Gap check for GSPS:* no current lifecycle rule exits after three consecutive adverse closes; `lib/lifecycle/` exits are price/stop-based. Candidate: a Gann "three-day wrong" exit in `lib/lifecycle/` and the replay.
- Buying outright is not safer than margin (stocks can go to zero); only "safe" to buy outright around $10 or below. Always know what you'll do if wrong; stop loss; cut losses, hold winners. Old leaders go, new come.
### Watch bottoms and tops of previous campaigns (pp. 23–24)
- When a stock breaks the **previous bear campaign's bottom by 3 pts**, look for support at the **next older campaign bottom**, and so on back through history (1923–24 → 1921 → 1917 → 1914 → 1907 → 1903–04 → 1896).
- When a stock reaches its **all-time/extreme historical low** and holds several weeks/months **without breaking it by 3 pts** ⇒ strong position, buy, stop 3 pts under the old low. (Dow Jul 1932 at 40½ failed to get 3 pts under the 1903 low 43 → support; dull, narrow, lowest volume since 1929 = accumulation.) In extreme bear markets a return to levels **20–30 years old** that holds = support.
- U.S. Steel Jun 1932 21¼, only ⅝ below its 1907 panic low → buy, stop 19.
- **Old tops: the further back they are, the more important when crossed by 3 pts** (Westinghouse: triple support 38½–40½ 1918–21; crossed 1915 high 74⅞ in 1925; crossed 1902 all-time high 116½ → pyramid to 292⅝ in 1929).
- In a bear market watch former **tops** as well (Dow broke 3 under 1919's 120 → next 110 → broke → 85; rally back to 119 failed at old top ⇒ still bear).
### Early leaders (pp. 24–29)
- **Bear-market early leaders:** stocks that top and distribute before the rest; stocks that break the bottoms of previous years or of several months *ahead* of others (Chrysler topped Oct 1928, 11 months before the Dow; fell 140½ → 5).
- **Failure-to-cross rule:** a stock that advances sharply in year 1–2 of a bull market, then **fails for two years to cross that early top**, is weak → short when monthly/weekly trend turns (Corn Products: Jul 1935 high 78⅜ failed by 12 pts to reach Aug–Sep 1933 high; a narrow week followed by a sharp decline on large volume = trend change; shortable even while Dow rose).
- **Bull-market early leaders:** stocks that bottom and accumulate before the rest; **cross the tops of previous years / of past few months ahead of others** (American Commercial Alcohol bottomed Oct 1931, 8 months before the list; U.S. Smelting crossed all tops back to 1930 in Apr 1933 → pyramid through 1929 high 73 and all-time high 81 → 141; U.S. Industrial Alcohol double bottom 13¼/13½; United Fruit crossed 1932 high in Mar 1933; Chrysler higher bottom 7¾ vs 5 → crossed 1932, 1931 (25¾), 1930 (43) tops → 60¾ top on big volume; 1934 low **held ~half of the 1932–34 advance** = strong; Mar 1935 double bottom 31 (1¾ above 1934) → crossed 1934 top 60⅜ → 93).
- Double-top sell with stop 3 above; bottoms 1¾–2 pts above prior bottom = support.
- Chrysler Mar–Dec 1935: +62⅞, never reacted more than 9 pts — pyramid while uptrend "plainly shown."

### Detecting stocks in strong position (pp. 29–30) — Westinghouse worked example
Jun 1932 low 15⅝ = 1907 low → buy, stop 3 under. Feb 1933 higher bottom (+3¾) in a dull narrow range = accumulation. Crossing Sep 1932 top 43½ (Jul 1933) → buy more. 58¾ top with daily/weekly topping + large volume → sell & short. Oct 1933 higher bottom (+9¼). Feb 1934 top 47¼ on 5 M/day market volume → exit/short. Jul 1934 low 27⅞, only ¾ below Oct 1933 (a buy around 29 with 3-pt stop at 26 not hit). Narrow range → accumulation; **"failed to break the old bottom by one point"** → buy. Apr 1935 crossed 1934 top 47¼ → buy; Jul 1935 crossed 1933 top 58¾ → buy; "should not decline 3 points under this old top (55)" — reacted to 57 only → 98¾.
- Reason to watch it: never split, no stock dividend in 1929 (capital structure matters; splits/watering dampen advances — same observation for U.S. Steel).

### New lows late in a bear campaign (p.30)
- Breaks to new lows **late** (after 2–3 years of decline) do not run as far as breaks early in the campaign.
- **Rule: after a new low, a rally back 3 points above the old bottom = decline over, liquidation complete.** (AT&T: broke 1907 low 88 after 33 months of bear, fell to 70¼, closed month at 89½; Aug 1932 at 91 = 3 above 88 → buy → 121 in <2 months.) Mirror: Consolidated Gas failed to get 3 points back above its 1932 low of 32 → short.

### New highs late in a bull market / after the top (pp. 31–32)
- Late movers can top **after** the averages (Timken, U.S. Industrial Alcohol made highs Oct 1929 after the Sep 3 top: "the time was not yet up for this late mover"). Don't short a stock because the average turned — trade its own trend.
- After a bull top: sharp quick decline → secondary rally → prolonged bear. A few (usually thin-float) stocks make new highs at the **secondary top** (Apr 1930). **Late to top ⇒ late to bottom** (Coca-Cola topped Jun 1930, bottomed Dec 1932 vs. most in Jun 1932). ⇒ **each stock has its own time period**, set by when *it* made its top/bottom (Chrysler topped Oct 1928, so its cycle ran ahead of other motors).
- Stocks that crossed their 1929 highs (American Safety Razor, Columbia Pictures, Congoleum, McKeesport Tin Plate, National Distillers): early leaders with higher bottoms/tops; the cross of the 1929 high = "sure sign of higher prices." National Distillers: double bottom vs 1926 low, crossed 1932, 1931, 1928/29 highs → 124 when "everybody was bullish and talking 500 to 1000" → sell & short (**mass euphoria = exit**).
- Laggards (American International, Standard Gas & Electric, National Dairy, U.S. Realty, Loft, Continental Motors): never crossed prior-year highs → leave alone. "Trade stocks that cross former highs and make higher tops and bottoms; leave the dead ones alone."
- **Weak stocks in a bull market:** stocks that rally only **2–3 months** at the start of the new bull campaign and **never cross that first rally's top** are weak (short-covering rally only; American Home Products).

### Independent movers & relative strength (pp. 35–38)
- Auburn Motors often moved opposite to motor stocks; compare stocks in the same group and trade the strongest long, weakest short. **Paired long/short** (United Fruit short vs. Chrysler long through 1935, weekly swing chart comparison): profit on both sides simultaneously.
- **Two-to-three-month rule (p.38):** in a bull market a stock that is going higher **will not react more than two to three months and resumes the uptrend in the third month**; if it continues down in the third month it is going lower. Chrysler 1926–28: never a >2-month decline; after the 1928 top never a >2-month rally to Nov 1929; Apr 1930–Jun 1932 never a >2-month rally. Rails Feb 1931 → 1932 **never rallied more than one month** = great weakness / real panic. Sign of bear weakness: rallies of only **6–7 weeks, not higher in the third month**.
  - ⇒ **Implementable time-based trend-strength criterion** on monthly bars: length of the longest counter-trend run (in months) since the last swing; ≤2 = strong trend, a counter-move extending into month 3 = trend change warning. Complements `lib/gann/ruleOfThree.ts` (which counts closes) — this counts *monthly legs*. Check against `lib/gann/trendStrength.ts` (swing structure only; no time-of-reaction test).
- Breaking the **lowest level in history** (Rails broke Aug 1896 low 42) ⇒ much lower prices; stay short until a change in trend.
- Thin float is no reason not to short (Case Threshing 515 → 16¾; Auburn 514 → 15; Radio 549 → 2½ in 32 months = −546½, greatest 1929–32 decline). "A stock is good to buy no matter how high as long as trend is up… a short sale at 25 or 20 as long as trend is down." Limit risk to a few points on every trade — never buy outright.

### Wait for a definite buying signal at bottom (p.39)
- After a panic there is always plenty of time to buy — **accumulation at the bottom takes a long time** (Johns-Manville held ~10 for ~4 months Apr–Jul 1932). Wait **several weeks or months**; if it holds bottom levels, buy with stop under the bottom. Don't try to catch the bottom/top eighth; don't anticipate.

## Ch. VI — Volume of Sales (pp. 39–?)
"Volume is the real driving power behind the market" — shows whether supply or demand is increasing.
**Rules for culminations by volume:**
1. End of a prolonged bull campaign or rapid advance ⇒ **large increase in volume** marks the end (at least temporarily). After a sharp decline on heavy volume, a **secondary rally on decreasing volume** ⇒ final top, main trend turning down.
2. After a **second, lower top**, a dull narrow sideways period, then a **breakout on increased volume** ⇒ further decline.
3. At the end of a prolonged decline (weeks/months/years), **volume decreases and range narrows** ⇒ liquidation running its course; change in trend coming.
4. After the first sharp advance off a bear bottom, a **secondary reaction on decreasing volume**, then advance on **heavier volume** ⇒ higher levels.
- Apply to total exchange volume (daily/weekly/monthly) and to individual stocks.
- **Summary:** sales increase near tops, decrease near bottoms — **except** in abnormal/panic markets (Oct–Nov 1929) that culminate on huge volume with a sharp bottom and swift rebound (a *selling climax*).
- ⇒ GSPS mapping: `lib/gann/volumeClimax.ts` implements the climax-volume case. Rules 1–4 (volume *drying up* at bottoms and on secondary tests; volume *expanding* into tops and on breakouts) are richer than a single climax test — check whether the volume criterion covers the "decreasing volume on the secondary test" confirmation (Rule 4) and the "rising volume into a top" warning (Rule 1).
### Monthly NYSE volume 1921–1935 (pp. 40–?) — Gann's worked reading
- 1921 bottom: 10–12 M shares/month. Mar 1928 first 84 M month; Nov 1928 114 M.
- 1929: Sep >100 M at the 386 top; **Oct: first time since May 1929 the averages broke under a previous month's low ⇒ trend turned down** (the **monthly-low-break rule**), record 141 M; Nov panic bottom 72 M; Dec 83 M.
- 1930: Jan 62; Feb 68; Mar 96; **Apr 111 M on a very small price gain** (volume without progress = distribution at the secondary top); May broke April low (first monthly-low break since Nov 1929 bottom) on 78 M → sharp decline; Jun 80; Jul–Aug small rally only 80 M for two months; Sep 50 M new lows; Oct broke Nov 1929 lows on 70 M; Dec −46 pts below Nov 1929 lows, 60 M.
- 1931: Jan rally 42 M; **Feb rally top on 64 M = volume rising on a rally that met resistance just under the Nov 1929 panic lows** (old bottoms → resistance); Mar decline 64 M; Apr 54; May 47; Jun 59 M decline to 120 (1919 top / May 1925 low) then quick rally to 157½ failing under the May 1931 high; Jul 33 M narrow; Aug 24 M dull; **Sep activity 51 M and −45 pts in the month ⇒ great weakness**; Oct 48 M to 85; Nov rally to 119½ (1919 top / 1925 low / prior rally bottom) on **decreasing** volume 37 M → failure ⇒ trend still down; Dec new low 72 on 50 M (largest since Sep) = liquidation continuing.
- 1932: Jan low 70 on 44 M; Feb rally to 89¾ on 31 M.
- 1932 (cont.): Mar same high on 33 M then "went dead on the rally"; Apr broke Jan low 70 → 55 (30 M); May broke 53 (1907/1914 panic lows) → 45 (23 M); Jun new low, 23 M; **Jul 8 low 40½ on very small volume and narrow range; late July crossed the June high (first monthly-high cross) ⇒ trend turning up.** May+Jun+Jul = 69 M total, smallest since 1923 vs >100 M/month at the 1929 top ⇒ "sold to a standstill."
- Aug 1932 83 M (more than prior three months) short covering + investment buying; Sep top on 67 M; total Jul 8→Sep = 168 M; **failed to go higher in the third month.** Since no rally Apr 1930–Jul 1932 had lasted >2 months, **a prolonged bull market required an advance of three full months or more** (the 3-month rule as a regime-change test).
- Oct–Dec 1932 23–29 M; Jan 1933 19 M; **Feb 1933: 19 M — smallest in >10 years, smallest since the Sep 1919 top ⇒ "a sure sign of bottom";** low 50, 9 above Jul 1932 (higher bottom).
- 1933: Mar 20 M rally; Apr off gold standard 53 M; May 104; Jun 125; Jul 120. **Mar–Jul 1933 = 422 M shares for +60 pts — greater than May–Sep 1929 (350 M for +96)** ⇒ inflation buying wave on thin margin → 4-day break Jul 18–21 (−25 to 85). Aug–Sep rally to within 2 pts of July high = **double top on smaller volume (⅔ of July)**; Oct 82½ low on 39 M, dull/narrow.
- 1934: Jan 54 M, Feb 57 M, top ≤1 pt above Jul 1933 high = **third time at same level + 111 M in two months + slow progress = top**; Jul 26 1934 bottom on ~3 M/day, month 21 M, narrow ranges — and Jul 1934 is **one year from the Jul 1933 extreme high** (rule: watch 1, 2, 3 years from any important top/bottom). Sep 1934 12 M within 1 pt of July low = **sure sign of bottom** (smallest monthly volume in many years).
- 1935: Feb rally top on only 14 M = insufficient buying power; Mar last decline 16 M; Apr 22 M bull under way; May crossed 1933 and Feb 1934 tops on 30 M; Jun crossed 120 (above Nov 9 1931 high) = sure sign higher; Aug 43 M; Oct 142 on 46 M; **Nov 57 M ≈ Feb 1934 top volume; week ended Nov 23 ~19 M, largest since the Feb 10 1934 top week** ⇒ watch for top.
- **Equal-points rule (p.45):** Jul 1934 → Nov 1935 advance = 65 pts on 407 M shares; Mar–Jul 1933 advance = 60 pts. "With the averages up 65 points, 5 points more than in the 1933 campaign, it was time to watch for at least a temporary change in trend." ⇒ Compare the **point extent of the current campaign with the prior campaign**; reaching/exceeding it flags a culmination. (Also: SEC era cut volume — 15-month campaign had ~15 M fewer shares than the 5-month 1933 campaign; absolute volume thresholds are regime-dependent — compare volume *relative to its own history*.)

## Ch. VII — A Practical Trading Method (pp. 46–48)
Use the **weekly high-low chart** (best for trading); use the daily chart for very active, high-priced stocks with the same rules. Paper-traded over 10+ years.
- **Rule 1 — Capital:** ≥ **$3,000 per 100 shares** traded ($300 per 10 shares). **Never risk more than 10% of capital on one trade.** After two or three losses, reduce the trading unit (risk 10% of the *remaining* capital). When profits equal the starting capital, the unit may double (e.g. 200 shares) — but keep large capital behind each trade. **Safety first**: bank a reserve fund out of large profits (savings, first mortgages, gilt-edge). *(Part of p.46 is missing in the scan — marked "[text skipped]" in the source.)*
- **Rule 2 — Stops:** always; 1, 2 or 3 points from entry; **never risk more than 5 points ($500 per 100 shares)** even on the first trade; **a 3-point stop is safest — "caught less than any other."** Aim for 2–3 pt risk where possible; never 10. After a prolonged, fast advance at high levels with big profits: trail **5 pts below each day's high**, or 1–3 pts under the day's low/close; at very high levels **10 pts under each day's high.** Otherwise trail **1, 2, 3 or 5 pts under each week's bottom** (longs) / above each week's top (shorts).
- **Rule 3 — Buying points:** (a) double/triple bottoms, stop 1–3 below; (b) holds **1, 2, 3+ weeks around the same low**, stop 1–3 (never >3) under the lowest weekly bottom; (c) crosses previous high levels by 1–3 pts — safest to wait for **3 pts above an old top**; after that it should not react 3 pts under the old top (worked: old top 50 → 53 → should not see 47; buy 51–48, stop 47); (d) **new all-time high territory** — usually higher, seldom reacts 3 under the old high; (e) **crossing the top of a previous year by 3 pts** — nearly always safe, esp. on a reaction back to the old top; (f) **bull-market reactions last only 2–3 weeks** — buy at the end of a 2–3-week reaction once the stock holds 2–3 days.
- **Rule 4 — Selling points:** mirror: double/triple tops (stop 1–3 above); break of old bottoms — safest to wait for **3 pts under an old bottom**, sell at market or small rally, stop 3 above the old bottom; after new lows trail **1 pt above the previous week's high**; cover at an old bottom/previous low level; **bear-market rallies last 2–3 weeks** — short at the end of week 2–3 with stop 3 above the previous week's high; breaking a **previous year's bottom by 3 pts** — nearly always a safe short, esp. on a rally back to it.
- **Rule 5 — Pyramiding:** price **20–50: add every 5 points**; **80–200: add every 10 points**; add only when the prior lot shows the full interval of profit; move the stop so the combined position can't lose. After the 4th–5th lot **reduce the unit** (e.g. 100 → 50 shares; 200 → 100). Never add a second lot unless the first is in profit. **Never average a loss** — "the greatest mistake any trader can make."
- **Rule 6 — Reversing:** when the trend changes, close longs **and** go short (and vice-versa). Worked: stock at an old top ~75 holds 1–2 weeks → sell longs, short, stop 78 (**4 pts above the old top** here, 3+1); if stopped, cover and go long again — "keep with the trend all the time."
- **Rule 7 — Volume:** rising volume into rapid advances/high levels; after the first sharp reaction, a secondary rally on **smaller volume than the final-top advance** ⇒ main trend turning down; after a prolonged decline, **falling volume** ⇒ liquidation done; in panics bottoms can come on **large volume**, then a rally on fair volume, then a **secondary decline on much smaller volume**. **Judge volume relative to shares outstanding** (GM 44 M shares moves slower per point than Auburn/Case or Chrysler 4.5 M) — i.e. normalise volume by float.
- "The human element beats most traders, not the market." Eliminate judgment/guesswork; prove the rules, then follow them "strictly to the letter"; don't take profits until the rules signal a change in trend.
- *(Corrected 2026-10-01. Rules 6 and 7 refer to "all the trades made in Chrysler Motors" and to Chrysler volume examples "at the end of this Chapter", and the 1954* Economic Forecaster *says the book held "an actual trading record for 10 years in Chrysler Motors". This 52-page edition does not print that record: Ch. VIII follows directly on PDF 48. The 1935 Chrysler tables it does print (PDF 36–37, the Chrysler/Auburn comparison and the week-by-week United Fruit short against Chrysler long) are read and recorded under Ch. IV. All seven charts were viewed; see `docs/memory-bank/reading-log/other_gann_books_pictures.md`.)*

## Ch. VIII — Future of Stocks (pp. 48–52)
- Fulfilled forecasts: 1923 (*Truth of the Stock Tape*): chemicals, airplanes, radio would lead 1924–29 ✔; 1930 (*Selector* p.191): chemicals, radio, airplanes, movies would lead the next bull ✔ (Radio B 3 → 92; United Aircraft 6½ → 46⅞; Allied Chemical 42½ → 171); 1930 (*Selector* p.198): motors overbought/over-capitalised → best shorts ✔ (Auburn 514 → 15; Chrysler 140½ → 5; GM 54¼ → 7⅝).
- **~20-year investors' panic cycle** (quoting *Selector* pp. 203–204): 1837–39, 1857, 1873, 1893, 1896, 1914, 1920–31; mechanism = money market / bank loan cycle (banks over-lend in prosperity, call loans in depression; newspapers amplify both extremes). The 1929 panic was a *gamblers'* panic; the coming investors' panic "the greatest in history" because stock is widely held by millions of unorganised holders who all sell at once. **Gann states this forecast "was based on my Master Time Factor, which enables me to tell months and years in advance when certain time cycles repeat and cause extreme high and low prices."** (p.50) — explicit primary attribution of the ~20-year cycle forecast to the Master Time Factor (cross-ref A2.1 Ch. 7; `lib/gann/decadeCycle.ts`, `timeCycles.ts`).
- Contrarian rule: "When everybody decides stocks cannot go down or cannot go up — they always do the opposite." "When everybody is convinced an event is going to happen, it usually has already happened or been discounted." Once a cycle is due to decline, **nothing (government included) can stop it until it has run its course**, and vice-versa.
- 1936 outlook: inflation since 1933 is discounted; market preparing to discount **deflation before the Fall 1936 election**; next bear market on smaller volume due to SEC rules. (Remainder pp. 51–52 is political commentary on the New Deal — no market technique; recorded as context only: "law of compensation" — nothing good without paying for it.)

---

## What is NEW relative to the prior memory bank (A5 entry)
The previous A5 entry summarised the book at a high level. This full read adds, with page refs:
1. **The complete 3-point rule family** (p.20, pp.46–47): single/double/triple bottom stops; 3-pt breakout confirmation; "should not react 3 points back under an old top"; previous-year high/low crossing by 3 pts; 3-pt recovery above a broken low ends a bear (p.30); campaign-by-campaign support ladder (pp.23–24). GSPS's `lib/lifecycle/entryConfirmation.ts` "3-point rule" buffer and `lib/gann/entryTrigger.ts` lost-motion allowance draw on part of this; the **"no 3-point reaction back through a crossed old top" hold test** and the **"3 points back above a broken low = bottom"** reversal test are not implemented.
2. **Time-of-reaction trend tests** (pp.9–13, 38, 43, 47): bull reactions ≤2 months (≤2–3 weeks on weekly), bear rallies ≤1–2 months (2–3 weeks), a counter-move reaching the **third month** = trend change; a new bull needs **three full months** of advance. Not implemented anywhere in `lib/gann/`.
3. **The 1-day / 3-day post-entry validation rule** (p.23) — exit if the trade closes against you three successive days. Not implemented.
4. **Anniversary time windows** — 1, 2, 3 years (12/24/36/42/48 months) from every important top and bottom (pp.14, 15, 44). Compare `lib/gann/timeCycles.ts` (fixed annual calendar cycle) — this is the *swing-anchored* anniversary rule; verify coverage.
5. **Historical-duration windows** for campaigns (p.13): list prior campaign lengths, forecast windows from their range/clusters.
6. **Equal-points / equal-time campaign comparison** (pp.13, 15, 45): legs repeating the same number of points or days as a prior leg flag culminations.
7. **Monthly-low / monthly-high break as the trend-turn signal** on averages (p.40, 42: "for the first time since May 1929 the Averages broke under the low level of a previous month").
8. **Volume rules 1–4 + relative-to-float normalisation + volume drying up to multi-year lows = bottom** (pp.39–45, 48).
9. **Explicit rejection of Dow-Theory index confirmation** and of trading averages (pp.16–19).
10. **Capital/position rules**: $3,000 per 100 shares, ≤10% risk, reduce unit after 2–3 losses, double only after profits = capital, reserve fund, max 5-pt risk, 3-pt stop "safest", trailing-stop schedule by price level, pyramid spacing 5 pts (20–50) / 10 pts (80–200) with shrinking units after lot 4–5 (pp.46–47).
11. **Master Time Factor** named as the basis of the 20-year panic forecast (p.50).

## GSPS implementation cross-reference (checked against current `lib/`)
| Gann rule (this book) | GSPS today | Status |
|---|---|---|
| Crossing old tops/bottoms + buffer as entry | `lib/gann/entryTrigger.ts` (swing crossing + lost motion), `lib/lifecycle/entryConfirmation.ts` (3-point buffer) | Partially implemented |
| "Should not react 3 pts back under crossed old top" (hold test) | — | **Gap** (natural post-entry invalidation for `lib/lifecycle/`) |
| 3-day adverse-close exit | — | **Gap** |
| ≤2-month reaction / 3rd-month rule | `lib/gann/trendStrength.ts` uses swing structure only | **Gap** (time-of-reaction test) |
| Anniversary windows 1/2/3 yrs from swing points | `lib/gann/timeCycles.ts` | Verify (calendar vs swing-anchored) |
| Volume culmination rules 1–4, dry-up at bottoms | `lib/gann/volumeClimax.ts` | Partial (climax only) |
| Volume relative to float | — | Gap (volume is not normalised by shares outstanding) |
| Monthly/weekly/daily chart hierarchy | `lib/analysis/trend.ts#readTrend` (monthly/weekly/daily) | Aligned |
| No index confirmation gating | `lib/marketScan.ts` macro breadth (`macroBreadthAgrees`) | **Checked 2026-09-27: aligned.** It tests the stock's own monthly/weekly/daily trends, not an index or group |
| ≤10% risk, reduce after losses, reserve fund | `lib/risk/*` (percent-of-account ceilings) | Aligned in structure; "reduce unit after 2–3 losses" ≈ cooldown; verify |
| Pyramiding spacing & shrinking units | — | Gap (no pyramiding in GSPS) |
| Price-level volatility (moves faster above 50/100/150/200) | ATR normalisation | Aligned in spirit (don't port point sizes) |

## Three-question notes (per AGENTS.md mandate)
1. **Gann tier:** Primary published book (1936) — the highest tier after the private course for *mechanical trading rules*; Chapter VII is Gann's own complete, paper-tested trading system.
2. **Cycle theory:** The book's time claims (≤2-month reactions, anniversaries, 20-year panic cycle, historical campaign-length ranges) are recurrence claims. Dewey checklist for the **20-year panic cycle**: repetition count ✔ (7 listed instances), regularity of timing ✘ (1837, 1857, 1873, 1893, 1896, 1914, 1920–31 — intervals 20, 16, 20, 3, 18, 6–17 → not constant), dominance/phase-resumption/wave-shape/cross-series not evaluated by Gann. ⇒ keep as context/confluence only. The reaction-duration rules are *trend-structure* rules, not periodicity claims — they need measurement (gate 2), not Dewey.
3. **Hermetic principle:** **Polarity** (every rule has an exact mirror for shorts — Gann states "reverse the rules" throughout); **Rhythm** ("action in one direction and reaction in the opposite direction… the balancing of time and price", p.9); **Cause and Effect** (volume = the cause, price move = the effect; "nothing can stop it until it has run its course"). Correspondence appears as "each stock has its own time period" — the same law expressed at a different phase per instrument.
