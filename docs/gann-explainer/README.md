# Gann method explainer PDF

`The_Gann_Method_Explained.pdf` is a plain-English, illustrated walkthrough of W.D. Gann's
actual trading method, compiled directly from all ten of his own books (see
`../GANN_HISTORICAL_SOURCES.md` for the source-by-source research it's built from). It's a
personal-study deliverable, not project documentation — GSPS-specific implementation status
lives in `../GANN_METHOD_COMPLETENESS_AUDIT.md`, not here.

The PDF is organized around six layers, ordered from best-evidenced to most speculative:
Discipline, Structure (price geometry), Timing, Confluence, "Vibration," and Tape Reading.
Every diagram is original — drawn fresh with matplotlib, none reproduced from the source
scans, since most of the ten books are still under active copyright.

## Regenerating

Two scripts, run in order:

```bash
python3 -m venv venv && ./venv/bin/pip install matplotlib reportlab
./venv/bin/python3 make_figs.py   # writes figs/*.png (10 original diagrams)
./venv/bin/python3 build_pdf.py   # assembles The_Gann_Method_Explained.pdf from figs/
```

`make_figs.py` defines each diagram as its own function (`fig_six_layers`,
`fig_discipline`, `fig_old_level`, `fig_retracement`, `fig_sections`, `fig_rule_of_three`,
`fig_confluence`, `fig_vibration`, `fig_volume_climax`, `fig_summary_map`). `build_pdf.py`
holds the prose and lays it out with reportlab's Platypus, pulling figures from `figs/`.

Note: a system Python may ship a `numpy` build with a mismatched compiled-extension ABI for
the interpreter actually running (`ModuleNotFoundError: No module named
'numpy.core._multiarray_umath'`) — a fresh venv, as above, sidesteps this rather than fighting
apt/pip's global `numpy` package.
