# B01 — Awodele, *W.D. Gann: Divination by Mathematics — Harmonic Analysis* (BEKH LLC, 2013)

| Field | Value |
|---|---|
| Tier | B (secondary, interpretive). It reproduces **Tier-A quotations** from Gann newspaper articles and a letter |
| Copyright | © 2013 BEKH LLC. **Synthesis only** |
| Read status | **Read in full**, all six chapters and the bibliography (2026-09-27) |

## Thesis
Gann's "cycle theory, or harmonic analysis" (*Tunnel* Ch. VII) and Harriman's method that "conform[s] closely to the law of harmonic analysis" (*Tunnel* Ch. XVI) refer to **Fourier harmonic analysis with Schuster's periodogram**, as set out in Henry Ludwell Moore's *Economic Cycles: Their Law and Cause* (1914).

## Primary quotations the book supplies (the reason this source matters)
1. **"OROLO" advertisement, *New York Herald*, Apr 18 1909** (attributed to Gann by content): "I investigated astrology and kindred sciences… In them all there was something lacking, and not until I struck upon **the law of vibration and attraction as applied in Wireless Telegraphy** did I find the key… **different stocks grouped into families, each having its own distinct vibration, which acts sympathetically upon others of the group and causes them to move in unison.**"
2. ***The Sun*, Dec 28 1921**: history "fluctuates in definite cycles, and if you work out the cyclic periods, and give some intelligent study to operating causes…". "One of his stunts is to **project a curve for the stock market**… he uses **a system of his own, simplified from that propounded by Henry Ludwell Moore… *Economic Cycles, Their Law and Cause***."
3. **Gann letter to John H. Spohn, Apr 1 1926**: "I have read Professor Moore's book and the trouble with him was that **he failed to get the right time factor** and of course did not know the cause behind market movements." And: "**You will find Schuster and Fourier theories helpful in analyzing the market.**"
4. ***Morning Telegraph*, Dec 17 1922**: "The most vital is **time**, and back of that is **the cause of recurrence** of high or low prices at certain intervals… It has taken me twenty years… That is my secret… the public is not yet ready for it."
5. ***Milwaukee Sentinel*, Jan 5 1919**: "I use geometry and mathematics just as an astronomer does, based on immutable laws which I have discovered" (the same wording reappears in *Tunnel* Ch. VII).
6. Course quotes (the exact lesson is not identified by Awodele):
   - "The next important major cycle is **30 years, which is caused by the planet Saturn**… rules the products of the earth and causes extreme high or low prices… at the end of each 30-year cycle."
   - "**We use the square of odd and even numbers to get not only the proof of market movements, but the cause.**"
   - "Every price at which a stock stops… is some important mathematical point… division of the circle of 360° or by the square of 12, the square of 20, or the square or half-way point of some other number… Every market movement is the result of a Cause."

   ⇒ The last matches Master Course Ch. 13/15A doctrine. **The Saturn attribution is not in the Master Course text read here; verify it against the Commodity Course (A8/A9) when available.**

## Method as reconstructed (Moore, Ch. 2)
- Fourier series y = A₀ + Σ(aₖ cos kt + bₖ sin kt). A₀ = mean. For a candidate period T: a = (2/N)·Σ x_t·cos(2πt/T), b = (2/N)·Σ x_t·sin(2πt/T). **Power = a² + b²**, scanned over T = 3 … N/2. Peaks = dominant cycles. Reconstruct with the chosen cycles and **extrapolate t forward** to forecast.
- Moore's rainfall (Ohio Valley, 1839–1910, 72 years): **8, 19 and 33 years** dominant. Awodele links these to Venus–Earth (8), the Metonic cycle (19) and Mercury–Earth (33).
- Stock examples (weekly mid-range (H+L)/2 prices):
  - CSX 1981–2000: 106 weeks dominant, plus 152, 91, 71, 127 and 79. The window is chosen between **Jupiter–Saturn heliocentric conjunctions**.
  - CSX 2000–2013: 121 weeks.
  - NSC monthly 1982–2013: 113, 159, 62, 44, 36, 32 and 21 months.
  - Out-of-sample "forecast" charts are shown, with no statistics.

## Critical assessment (for GSPS use)
- **Strong:** the Tier-A quotations above make Fourier/Schuster analysis **citably Gann's own recommended tool** (1926 letter), not a modern graft. This upgrades the grounding of `lib/gann/spectralCycle.ts` from "*Tunnel* uses the phrase" to "**Gann named Fourier and Schuster in writing**."
- **Weak:** Awodele's own practice has well-known failure modes. **Do not port it:**
  1. **No detrending** of trending price series. He observes that "the larger the cycle, the greater the coefficient", which is exactly the red-noise/trend leakage artifact. (`spectralCycle.ts` already detrends linearly. Correct.)
  2. **Spikes at N/k** ("683/3 = 227… not sure if a true cycle"): window-length harmonics and leakage. Needs a taper or a check that the period is not a divisor of the window.
  3. **Cycles hand-picked to fit** in-sample, then shown "forecasting". That is overfitting, with no significance test.
  4. **Moore's source explicitly cites "Schuster's test of probability"**, which Awodele never applies. **Schuster's periodogram test**: under white noise, the probability that the normalised peak power exceeds κ is ≈ e^(−κ), times the number of independent frequencies. This is the missing piece for Dewey's **dominance** criterion.
- **Gann's own critique of Moore ("failed to get the right time factor")** implies Gann's "simplification" anchored on **specific starting points and known time factors** (his pivot-anchored counts) rather than a blind whole-series periodogram. That is consistent with everything in the Master Course, where **time is always counted from a specific high or low**.

## GSPS cross-reference
| Item | GSPS | Action suggested (owner decision) |
|---|---|---|
| Fourier/Schuster named by Gann (1926) | `spectralCycle.ts` (confluence, hypothesis-only) | Header already cites the letter via A3/B1. Keep. Optionally add the **Schuster probability test** as the numeric dominance gate (a better proxy than peak/mean power) |
| Window-divisor artifacts | `spectralCycle.ts` | Check that the candidate period is not ≈ window/k; consider a taper |
| (H+L)/2 as the analysed series | uses closes | Gann's own "moving average" is the per-period midpoint (Master Course). Optional alternative input |
| Anchoring on conjunction dates | — | **Not admissible** (astrology policy) |
| Magic squares / Pythagorean numbers (Hellenbach, Hartmann, Kircher, Liharzik) | — | Speculative. **No authorized spec. Excluded** |

## Three-question notes
1. Tier B carrying Tier-A quotes (1909 ad, 1919, 1921, 1922 articles, 1926 letter). Cite the quotes, not Awodele's interpretation.
2. Dewey/Tomes: harmonic analysis *is* the cycle-theory literature's own tool (Dewey and Tomes use periodograms). The 1926 letter makes it a **Gann–Dewey bridge**. Checklist: Awodele covers none rigorously. GSPS covers 3 of 7 (dominance, repetition, constancy). Schuster's test would harden dominance.
3. Hermetic: **Vibration** ("each stock… its own distinct vibration… sympathetically… in unison": the clearest Vibration statement in any source), **Correspondence** (families of stocks moving together; planets ↔ cycles, belief only), **Cause and Effect** (Gann's insistence on the "operating cause" behind the time factor).
