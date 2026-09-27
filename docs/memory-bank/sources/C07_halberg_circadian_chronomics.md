# C07 — Franz Halberg et al., "Transdisciplinary unifying implications of circadian findings in the 1950s" (*Journal of Circadian Rhythms* 1:2, 2003; 61 pp. incl. ~320 references)

| Field | Value |
|---|---|
| Tier | C (cycle-theory literature; chronobiology). Not Gann. |
| Copyright | Open access (BioMed Central). Verbatim redistribution is permitted with notice, but this file is still a **synthesis**, per project policy. |
| Read status | **Body read in full, pp. 1–54** (2026-09-27). Reference list pp. 54–61 scanned, not abstracted. |

## Content (synthesis)
Halberg, who coined "circadian," answers six editor questions as a memoir built around eleven "puzzles" from the 1950s. The methodological lessons, which are what GSPS needs:

1. **Phase confounding: fixing the clock time does *not* remove a rhythm's effect.**
   - Two groups of mice were compared at a single clock hour, a week apart, at progressively earlier hours. The result went large difference → no difference → opposite difference.
   - Cause: feeding schedule had put the groups' circadian rhythms in **antiphase**.
   - Only sampling across the whole cycle revealed it. Likewise, blinded (free-running) mice vs synchronized controls reversed day/night differences as their phases drifted apart.
   - General rule: comparing two populations at one point in a cycle gives conclusions that flip with phase.
2. **Cosinor method** (Halberg's statistical signature): fit a cosine of anticipated period by least squares and report:
   - **MESOR**: rhythm-adjusted mean, which has a smaller SE than the arithmetic mean
   - **amplitude**
   - **acrophase**: timing of the peak
   - each **with 95% confidence intervals**, plus a joint amplitude/phase error ellipse
   - **zero-amplitude test**: a rhythm is validated only if the error ellipse excludes the origin
   - A phase-only analysis (Batschelet; activity onsets) misses information. Test the amplitude.
3. **"Circa."** A period is an estimate with uncertainty. Free-running periods differ from exactly 24 h and between individuals (blinded mice ~23.5 h; rats 24.1–24.3 h, lengthening with light intensity, "Aschoff's rule").
   - Free-running (endogenous) vs **synchronized** by an external **synchronizer / zeitgeber** (light, feeding).
   - Feeding can **override** light as synchronizer, and presence of other animals can synchronize (social synchronization).
4. **Time-varying spectra.** "Gliding spectral windows" (moving periodograms) show components **coming and going**.
   - Newborns: the ~7-day component dominates the circulation for weeks before the circadian takes over.
   - Endothelin-1: circadian in one study, only ~8-hourly in another.
   - Lesson: dominance is not permanent. Map the spectrum over time.
5. **Beats between near periods.** A biological trans-year (~1.3 yr, CI excluding 1.0) **beats** with the calendar year, so a spectral component "is prominent at one time and disappears at another." An artificial 21-h schedule beats with the endogenous circadian.
   - A study result (neonatal BP amplitude vs family history) held in solar-minimum years and failed afterwards. Halberg calls this regime dependence, not "secularity."
6. **"Feedsidewards."** The same input has **stimulating, null or inhibiting** effect depending on the *phase* at which it arrives: melatonin on corticosterone; the same weekly dose of an immunomodulator inhibits tumour growth if given sinusoidally and enhances it if given in equal daily doses. Time-qualified effects replace time-unqualified feedback.
7. **Timing changes outcomes as drastically as survival vs death** (noise, irradiation, endotoxin, drugs, by clock hour). Chronoradiotherapy timed to tumour-temperature peak doubled 2-year disease-free survival.
8. **No master oscillator.** Ablating the SCN (the textbook "master clock") reduces amplitude and advances phase but **does not abolish** most rhythms. It is a "collateral hierarchy," a network of co-equal oscillators.
9. **Polarity in phase-shifting.** Advances are slower than delays, and within one organism some rhythms advance while others delay. Adjustment rate differs early vs later after a shift.
10. **Prior information enables a single timed test.** With a known ~23.5-h free-running period, one spot-check at a predicted antiphase time validated the hypothesis (NASA/Ames). Pre-registered prediction is strong evidence (cf. Dewey criterion 7).
11. **Generalization caution.** Prediction limits derived from five mouse stocks were exceeded when five more stocks were examined.
12. **Non-linear thresholds.** Risk stays flat over a wide range, then rises steeply past a threshold (Challenger O-rings; blood-pressure over-swinging, "CHAT"; low heart-rate variability). Such risks go unrecognised because averages look normal.
13. **Against "baselines."** Variation within the normal range is **structured, not random**. "The body strives for structured variation, not for constancy." A chronome is **rhythms + trends + deterministic chaos** together.
14. **Spectral reciprocity** (Halberg's heuristic; *cosmic content not admissible for GSPS*):
    - For each environmental cycle, seek a biological near-match, and vice versa. Examples: trans-year vs solar-wind speed; a 6.74-day geomagnetic component vs the biological week.
    - Also mentions Chizhevsky's circadecadal cholera, Clarke (1838) finding the ~10.5-yr sunspot signature in economics, and Kondratieff's ~50-yr cycle found in strokes.
15. **Circaseptan (~7-day) rhythms** are free-running for 18, 38 and even 156 weeks, with a larger amplitude than circadian in newborns, crayfish and *Acetabularia*. Halberg calls them endogenous and argues they are not merely a social artefact.
16. **Time-macroscopy vs time-microscopy.** The eye sees what the data show plainly; inferential statistics resolve what the eye can't. **Both are required**, and statistical findings should be reviewed again in the time domain. Motto: "Measure all that is measurable… as simply as possible, but no simpler."

## GSPS relevance (design lessons, none are Gann rules)
- **Backtest attribution and phase confounding (lesson 1).** Comparing "criterion passed" vs "failed" pooled across different market phases can flip sign by phase. `lib/backtest/attribution.ts` deltas should be read, where feasible, **split by regime/phase** (e.g. the 9-day swing trend direction, or first vs second half, as the 766-symbol run already does). This is Halberg's warning in trading form, and it echoes Dewey's criterion 6 (persistence through changed conditions).
- **`spectralCycle.ts` enhancements, confluence-only:**
  - report the amplitude **with a confidence interval**, plus a **zero-amplitude test** (cosinor), complementing the Schuster probability test suggested from B01
  - optionally a **gliding window**, to show whether the dominant period is stable or coming and going
  - treat the estimated period as "circa," i.e. a window, not a point
- **Gann time counts as windows (lessons 3, 5).** Near-periods beat, so a count can "fail" for a stretch and then return. This supports Gann's own tolerance language ("ahead of or behind time," A11) and the average-vs-specific point (C01).
- **"Time over price," given a mechanism (lesson 6).** The same price event carries different meaning depending on where it falls in the time cycle. This is the design reasoning behind GSPS weighting setups that coincide with a Gann time turn (`timePriceSquare.ts`, `timeCycles.ts`). The reasoning is from Halberg; the rule is Gann's.
- **No single master cycle (lesson 8).** This matches GSPS's uniform-weight decision (AGENTS.md: nothing ranks Gann's conditions *across* techniques). Here it is a network of co-equal oscillators, not a dictator clock.
- **7-day correspondence (lesson 15).** Gann's 7- and 14-day counts (A2.2 alternation; the *Tunnel*'s sevens) have a *correspondence* in the biological week. This is **not evidence** for Gann's 7s in markets; the market week is also a calendar artefact. Recorded as Correspondence framing only.
- **Excluded:** solar-wind, geomagnetic and "cosmos" influences on biology are astronomy-derived timing and fall under the AGENTS.md astrology boundary. Nothing to build.

## Three-question notes
1. **Gann:** not a Gann source. It supplies measurement methods (cosinor, gliding spectra, phase-aware comparison) for testing Gann time claims.
2. **Dewey checklist:**
   - Strongest on **constancy of period**, where it adds the "circa"/uncertainty caveat.
   - **Phase-resumption**: free-running vs synchronized is exactly Dewey's forced-vs-free diagnostic from the biology side.
   - **Dominance**: shown as time-varying.
   - **Cross-series clustering**: spectral reciprocity, but with cosmic content GSPS excludes.
   - Adds: amplitude significance testing and phase confounding in comparisons.
3. **Hermetic:**
   - **Rhythm**: rhythm is the foundation of life; structured variation, not constancy.
   - **Polarity**: advances vs delays; the same input stimulates or inhibits by phase.
   - **Cause and Effect**: timing determines the effect of a cause (feedsidewards).
   - **Correspondence**: Halberg's reciprocity rule.
   - Not Mentalism or Gender: Halberg's framework is empirical, and "generation" appears only metaphorically (RNA before DNA).
