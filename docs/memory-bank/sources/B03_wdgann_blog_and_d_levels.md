# B03 — W.D. Gann Inc. / Lambert-Gann company blog ("Is a Mathematical Seer", captured 2015) and B03b — "D Levels" table

| Field | Value |
|---|---|
| Tier | B (the company holding Gann's archive). It reprints a **1923 newspaper article** (Tier A content: Gann quoted) |
| Copyright | Blog © Lambert-Gann. The 1923 article is public domain |
| Read status | **Both read in full** (2026-09-27) |

## B03 contents
- **Mar 5 1923 article, "Is a Mathematical Seer" (Gann at 49 Broadway):**
  - "**I figure things by mathematics… If I have the data I can use algebra and geometry and tell exactly by the theory of cycles when a certain thing is going to occur again.**"
  - He repeats the 1909 creed: deal with causes, "exact proportion and perfect relationship… no chance in nature", Faraday.
  - 1923 business outlook: bank failures Apr–Jun, a fall depression, near-panic by October.
  - **Election forecasting by name letters and "fortunate numbers":**
    - Wilson ("W…N", like Washington)
    - Harding: born Nov 2 1865; fortunate numbers 2, 4, 6, 8, 11; the election on 11/2
    - "the letter H recurs every tenth cycle" (Harrison 9th, Hayes 19th, Harding 29th presidents)
    - Gann cast horoscopes for callers

    ⇒ Corroborates the name-letter numerology in *Tunnel* Ch. XVIII and Master Course Ch. 15A. **Citably Gann's, with no specification that could be validated.** It stays excluded from GSPS (not even confluence: there is no rule beyond letter coincidence).
- **Private Ephemeris 1940–1950** (company posts, 2011):
  - Gann annotated a Raphael's ephemeris as a diary: planetary **midpoints, declinations, heliocentric transits, lunar nodes**, "war days", lottery wins, trades.
  - Worked example: **Jupiter conjunct Mars on Dec 1 1948 was marked on his May Soybeans chart; beans made their final high there**, and records show him short Dec 1948 – Jan 1949.
  - "Gann did not advertise the fact that he used astrology."
  - ⇒ Additional primary-adjacent evidence (via the archive holder) for A2.3's astrology. **Policy unchanged: non-gating only, and only for real ephemeris calculations.**
- **Editions of *How to Make Profits in Commodities*:** two 1951 printings. Gann sold the book business and copyrights to Ed Lambert in 1951, and the second 1951 printing added **five-year forecasts on 8 commodity charts**. Useful if A8 becomes readable: note which edition.
- Other posts (chart reprints, GATE software seasonality, giveaways) are promotional. Nothing operational.

## B03b — "D Levels" table (13 pp., a numeric spreadsheet)
- Content: for n = 0 … ~470, the values **(n + k/8)² for k = 0 … 8**, i.e. every square and the seven intermediate values whose square roots step by ⅛. The header labels the 8 steps "Quadrant 0, 45, 90 … 360".
- **Correction to the prior catalog note ("decodes exactly to `squareOf9.ts`"):**
  - `lib/gann/squareOf9.ts` uses **level = (√anchor + deg/180)²**, so **180° = +1 in the root** and **45° = +0.25**. That matches the physical Square of Nine: odd squares (9, 25, 49 → roots 3, 5, 7) lie on one diagonal, and even squares (4, 16, 36) on the opposite diagonal, 180° away.
  - The D-table's steps are **+0.125 in root**. Under the same geometry each step is **22.5°**, and one table row (n² → (n+1)²) spans **180°, not 360°**.
  - ⇒ The table's "0…360" header is mislabelled (or uses a non-standard mapping). Its values are a **finer, 22.5° grid** of the same spiral. `squareOf9.ts`'s formula is the geometrically correct one; the D-table is not a second authority on it.
  - Record the mismatch so a future session doesn't "fix" `squareOf9.ts` to 0.125/45°.

## Three-question notes
1. Tier B, containing a Tier-A quote (1923). The ephemeris claims come via the archive holder, not a published Gann text.
2. Dewey: none of the numerology or astrology items carries any validation.
3. Hermetic: **Correspondence** (planets ↔ markets: the premise, not evidence). **Vibration** (names and numbers).
