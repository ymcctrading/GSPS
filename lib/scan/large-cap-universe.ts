/**
 * GSPS — the large-cap scanning universe.
 *
 * US-tradeable large caps ($10B–$200B market cap band), ranked by market
 * capitalisation, from a companiesmarketcap.com "Companies ranked by Market
 * Cap" export supplied on 2026-09-10.
 *
 * ## Why this is a committed file rather than a live fetch
 *
 * A scan universe has to be the same list on every run, or a symbol appearing
 * and disappearing between scans becomes indistinguishable from a setup arming
 * and de-arming. Fetching the list at scan time would also add a third-party
 * dependency to the critical path of a job that already has a 60-second budget,
 * for data that changes on the timescale of quarters. So the list is checked in,
 * reviewed in a diff when it changes, and costs nothing at runtime.
 *
 * ## What this list is NOT
 *
 * It is not a recommendation, a screen, or a ranking that survives past this
 * file. Membership means one thing: the coarse gate is willing to *look* at the
 * symbol. Everything that decides whether a symbol becomes a setup — the
 * liquidity floor, the coarse momentum gate, the full multi-timeframe scan, the
 * Execute threshold — runs afterwards and is unchanged by anything here.
 *
 * ## Coverage, stated honestly
 *
 * The source export lists 11,299 companies globally, unfiltered by exchange.
 * This file keeps only rows priced $10B–$200B whose ticker is either
 * US-domiciled (`country === "United States"`) or was already present in the
 * previous version of this list (i.e. a foreign company with a verified US
 * ADR/dual listing, like UBS or Sony). Foreign primary-exchange tickers with no
 * prior US verification (e.g. Novo Nordisk's `NVO`, Toronto-Dominion's `TD`)
 * were deliberately left out rather than guessed at — the export's own
 * "Symbol" column is whatever ticker the source displays for a company's
 * primary listing, which is not always the US-tradeable one, and there is no
 * exchange/tradability column to check it against. Closing that gap means
 * verifying candidates against Alpaca's `/v2/assets` (tradable, active,
 * `us_equity`) before adding them, not adding them on the strength of a clean-
 * looking symbol string alone.
 *
 * A handful of entries may be pre-IPO valuations, tracking/estimate rows, or
 * spun-off segments the source prices before they trade independently (the
 * export mixes those in with real listings, e.g. corporate-segment market-cap
 * estimates). That is an acceptable, self-healing failure mode: a symbol the
 * data provider cannot resolve returns no bars and is silently dropped by the
 * coarse pass, costing one wasted slot rather than a wrong answer — see "A note
 * on the symbols themselves" below.
 *
 * Validated 2026-09-10 against Alpaca's live `/v2/assets` (see
 * scripts/validate-large-cap-universe.mjs and
 * app/api/admin/large-cap-universe-check/route.ts): of 771 symbols, 766 were
 * active/tradable and 5 were not carried by Alpaca at all —
 * `WBS`, `PSHD.L`, `DAY`, `CFLT`, `APGE` — and have been removed. `PSHD.L`
 * was the expected foreign-fund false positive (Pershing Square Holdings,
 * London/Amsterdam-listed, no US ADR); the other four are real US tickers
 * Alpaca's active-asset catalog simply didn't resolve at check time. None
 * were non-tradable/halted — every symbol Alpaca did recognize was tradable.
 *
 * To refresh: re-export the source list, re-run the $10B–$200B band filter,
 * replace the array below wholesale, update LARGE_CAP_SOURCE_CAPTURED, and
 * re-run the Alpaca validation before committing.
 */

/** Where this list came from, so a future reader can tell what it covers. */
export const LARGE_CAP_SOURCE =
  "companiesmarketcap.com Companies ranked by Market Cap, filtered to the $10B-$200B band";
export const LARGE_CAP_SOURCE_CAPTURED = "2026-09-10";

/**
 * Ordered by market capitalisation, largest first.
 *
 * The order is load-bearing. `runMarketScan` trims the combined universe to its
 * `universeTop` budget, and this list sits behind the most-actives screener in
 * that combined order — so when the budget bites, the names that survive are the
 * biggest and most liquid ones.
 *
 * A note on the symbols themselves: they are transcribed exactly as the source
 * export published them, including tickers that may since have changed hands or
 * been renamed. They are not corrected against any other source. A symbol the
 * data provider cannot resolve returns no bars and is dropped by the coarse
 * pass, so a stale or bad entry costs a wasted slot rather than a wrong answer —
 * but a list that has drifted far enough to lose many at once would quietly
 * shrink the universe, which is the reason to refresh it from the source rather
 * than patch it by hand.
 */
export const LARGE_CAP_UNIVERSE: string[] = [
  "TMUS", "QCOM", "PEP", "SCHW", "DE", "ABT", "GILD", "DIS", "MCD", "ADI",
  "SCCO", "BLK", "WDC", "NEE", "T", "WELL", "UNP", "RIO", "UBS", "SMFG",
  "SHOP", "COP", "BA", "ETN", "BBVA", "PFE", "BX", "IBKR", "BUD", "UBER",
  "GLW", "DHR", "TJX", "SONY", "NEM", "NOW", "PBR", "UL", "MFG", "VRTX",
  "PLD", "BMY", "BKNG", "CB", "COF", "ISRG", "PGR", "SPGI", "CVS", "LMT",
  "BMO", "PH", "BP", "MDT", "BTI", "SNOW", "FTNT", "SBUX", "HDB", "MO",
  "BNS", "MPC", "VLO", "PDD", "NET", "LOW", "BNY", "ENB", "FCX", "ACN",
  "SPOT", "EQNR", "ASX", "CNQ", "SYK", "ADP", "PSX", "ING", "CM", "IBN",
  "CEG", "MCK", "HOOD", "EQIX", "SNY", "AEM", "APP", "SO", "ABNB", "ADBE",
  "VRT", "CME", "TT", "GSK", "USB", "KKR", "PNC", "GD", "MELI", "PWR",
  "DUK", "HWM", "WMB", "HCA", "CSX", "ITUB", "LITE", "BCS", "ICE", "JCI",
  "CMCSA", "WM", "MAR", "ELV", "BN", "INTU", "LYG", "DASH", "EPD", "MMM",
  "SLB", "UPS", "MRSH", "MNST", "EMR", "REGN", "MCO", "AMT", "SU", "CVNA",
  "DDOG", "E", "CTAS", "MDLZ", "BE", "CP", "CDNS", "HPE", "SHW", "NGG",
  "SPG", "APO", "EOG", "TRV", "DB", "CMI", "ECL", "BAM", "MSI", "GM",
  "SNPS", "ITW", "ET", "NTES", "CNI", "NWG", "CI", "B", "NOC", "FDX",
  "NSC", "NU", "ROST", "TGT", "DLR", "MFC", "WPM", "RACE", "CL", "WBD",
  "KMI", "ORLY", "RCL", "AMX", "HLT", "RSG", "AEP", "SE", "TRP", "APD",
  "VALE", "IMO", "NBIS", "BSX", "HON", "AON", "PCAR", "ALL", "URI", "BKR",
  "AJG", "TRGP", "ARGX", "TDG", "CVE", "COR", "OXY", "TFC", "MPLX", "MET",
  "SUNB", "OKE", "NOK", "GWW", "TER", "RELX", "CRH", "COHR", "TEL", "MPWR",
  "NUE", "TAK", "MT", "AFL", "D", "LNG", "UMC", "O", "FIX", "FANG",
  "CTVA", "KEYS", "NXPI", "FAST", "CAH", "SRE", "NKE", "PSA", "AU", "AME",
  "MRNA", "DVN", "F", "MSTR", "STT", "NDAQ", "GRMN", "CRWV", "ALAB", "DAL",
  "ETR", "FNV", "VST", "VMRK", "EW", "FITB", "BDX", "AMP", "HONA", "HUM",
  "CIEN", "DEO", "CARR", "XYZ", "NTRA", "XEL", "AZO", "ROK", "WAB", "LHX",
  "CBRS", "ABEV", "COIN", "WDS", "EBAY", "STM", "VTR", "MDLN", "CCEP", "CMG",
  "EXC", "TEAM", "WDAY", "PYPL", "RVMD", "KB", "ARES", "INFY", "CCJ", "SLF",
  "KDP", "HEI", "ADSK", "FERG", "TEVA", "IQV", "VEEV", "FMX", "CLS", "TRI",
  "GFI", "ADM", "FLEX", "PAYX", "A", "HMC", "HLN", "IDXX", "IX", "PRU",
  "WCN", "CBRE", "RKLB", "MSCI", "AXON", "ED", "WAT", "ONC", "MCHP", "YUM",
  "LYV", "VOD", "TTWO", "AIG", "SYY", "DHI", "ROP", "NTR", "SHG", "VG",
  "RKT", "VIK", "ODFL", "HIG", "EC", "JD", "BBD", "NTAP", "PEG", "TKO",
  "KGC", "EL", "MLM", "QSR", "RPRX", "TWLO", "UAL", "HSY", "WEC", "KR",
  "ALNY", "TECK", "STLD", "CHT", "MTB", "IRM", "EQT", "KVUE", "CQP", "NTRS",
  "RJF", "HBAN", "PUK", "ESLT", "EME", "ALC", "CCI", "ERIC", "KMB", "ACGL",
  "EXPE", "JBL", "VMC", "P", "RBLX", "RMD", "DXCM", "CNC", "CRDO", "UI",
  "BIDU", "PCG", "BIIB", "CCL", "ILMN", "HAL", "NMR", "FTI", "CBOE", "ZTS",
  "ROIV", "OKTA", "EXR", "BAP", "CPRT", "GEHC", "AEE", "CFG", "HPQ", "KHC",
  "WTW", "TS", "MDB", "PBA", "IR", "DTE", "RDDT", "FTS", "ATO", "INSM",
  "ATI", "RYAAY", "LVS", "ZM", "AWK", "VICI", "ON", "TDY", "LPLA", "DG",
  "ZS", "WSM", "FE", "CPAY", "ES", "CPNG", "ECHO", "OTIS", "Q", "CTSH",
  "CNP", "LH", "PPL", "DGX", "CINF", "WRB", "VRSN", "FISV", "MTD", "TPL",
  "SYM", "DOV", "NVT", "SMCI", "INCY", "RF", "CRCL", "GFS", "SYF", "JBHT",
  "XYL", "TCOM", "BNTX", "TSEM", "EXPD", "PHG", "PFG", "ASTS", "FWONK", "NRG",
  "FCNCA", "HUBB", "FOX", "BSP", "SN", "PPG", "DRI", "BG", "VNOM", "WST",
  "CIB", "CASY", "KEY", "RIVN", "ULTA", "VRSK", "VLTO", "GPN", "AFRM", "TROW",
  "KOF", "FFIV", "CRS", "ROKU", "IHG", "TPR", "PHM", "IOT", "ARXS", "CHD",
  "AMRZ", "SOFI", "EXE", "BRO", "RGLD", "TW", "L", "DLTR", "AER", "SW",
  "MKL", "EIX", "ENTG", "MTSI", "GH", "FSLR", "UTHR", "THC", "CDE", "XPO",
  "IFF", "OMC", "CMS", "DOW", "FICO", "USFD", "STE", "CF", "CW", "LYB",
  "STZ", "SNX", "WES", "PKG", "RS", "RL", "NI", "WWD", "GIS", "SBAC",
  "PR", "EFX", "FIS", "SNA", "LEN", "MTZ", "DINO", "BR", "TPG", "FTAI",
  "VTRS", "LUV", "ESS", "TOST", "EVRG", "U", "FDXF", "GPC", "SSNC", "BBY",
  "IP", "RBRK", "PAA", "TSN", "MKSI", "NTNX", "ZBH", "CHTR", "ITT", "GEN",
  "OVV", "CDW", "NWS", "TSCO", "SITM", "LNT", "CHRW", "EWBC", "NDSN", "BEN",
  "WCC", "DD", "NLY", "OWL", "ONTO", "FTV", "CLH", "INVH", "ROL", "IEX",
  "J", "NVR", "APG", "LSCC", "MEDP", "ZBRA", "WY", "LDOS", "RGA", "BALL",
  "WPC", "JLL", "AKAM", "KIM", "NBIX", "CG", "APA", "DOCN", "IONQ", "RBC",
  "SOLV", "TLN", "HST", "SMTC", "BEP", "MAA", "STRL", "LAMR", "CRBG", "OHI",
  "BURL", "PFGC", "ARMK", "PNFP", "H", "BBIO", "ALB", "LECO", "TRU", "UNM",
  "WMG", "ULS", "DT", "SUI", "SUN", "BMNR", "PS", "DOC", "EXEL", "BWXT",
  "SGI", "PAG", "EQH", "IVZ", "ARCC", "MLI", "REG", "TYL", "HL", "PTC",
  "SWK", "MKC", "AIZ", "RVTY", "TXT", "W", "MAS", "FIVE", "CACI", "CRL",
  "CSL", "AA", "TRMB", "BWA", "DTM", "AMH", "QXO", "SJM", "TTMI", "CHYM",
  "GL", "AUR", "UDR", "QNT", "LII", "IESC", "AVY", "SEIC", "CNA", "WSO",
  "AMKR", "ERIE", "RPM", "ALLY", "NXT", "MDGL", "BAX", "PEN", "COKE", "MAIR",
  "HAS", "CORT", "BMRN", "AGNC", "TOL", "UHAL", "GLPI", "COO", "GGG",
  "BTSG", "ELS", "HALO", "BF.A", "SF", "CCK", "CPT", "DOCU", "AR",
  "MANH", "EHC", "CSGP", "FNF", "AIT", "WTRG", "WTS", "DKS", "GDDY", "GWRE",
  "HUBS", "PNW", "TXRH", "ELAN", "DKNG", "FIG", "AHR", "DVA", "ARWR", "AFG",
  "CR", "FHN", "BXP", "HRL", "SWKS", "PSKY", "AEIS", "TECH", "JEF", "KNX",
  "BJ", "JKHY", "EVR", "HII", "TEM", "SANM", "AXSM", "GNRC",
  "ARW", "DECK", "ALGN", "SCI", "AM", "CLX", "CART", "FROG", "NYT", "UMBF",
  "LFUS", "IT", "DAR", "EGP", "DPZ", "RRX", "GKOS", "GSAT", "ALSN", "AES",
  "BPOP", "CGNX", "MGM", "DCI", "UHS", "PINS", "KRYS", "CYTK", "SSB",
  "OC", "WTFC", "MOH", "RYAN", "BIO", "FRT", "AVTR", "CFR", "SOLS", "ENSG",
  "GMED",
];

/**
 * Mega-caps: US-tradeable companies above this file's $200B band ceiling.
 *
 * Added 2026-09-26 by project-owner direction, ported from the unmerged
 * `claude/great-brown-h6hops` branch (where it was compiled 2026-09-25). The
 * point is to have mega-cap names scanned deliberately rather than
 * incidentally, so their setups reach users (and later the newsletter). Before
 * this, mega-cap coverage was `MAG7` plus whatever a sector watchlist carried,
 * plus the most-actives screener: production's coarse-gate telemetry for
 * 2026-09-19..25 shows 18 of these 71 names (NFLX, COST, WMT, PLTR, HD, KO,
 * PG, CSCO, IBM, TXN, VZ, PM, AMAT, LRCX, ANET, PANW, AXP, GOOG) reached the
 * coarse gate on only one of those seven scan days.
 *
 * **Sourcing is weaker than `LARGE_CAP_UNIVERSE` above.** That list came from
 * a dated export and was validated against Alpaca's `/v2/assets`. This one is
 * hand-compiled from well-known names and has not been through
 * `scripts/validate-large-cap-universe.mjs`. What is verified: every one of
 * the 71 appears in production's `coarse_gate_telemetry` for 2026-09-25, so
 * each resolves bars on the live feed. 21 of them also sit in
 * `LARGE_CAP_UNIVERSE` (their cap was under $200B at that list's capture);
 * `SCAN_DISCOVERY_UNIVERSE` below de-duplicates them.
 */
export const MEGA_CAP_UNIVERSE: string[] = [
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "AVGO", "TSM",
  "WMT", "JPM", "LLY", "V", "MA", "NFLX", "ORCL", "COST", "HD", "PG",
  "JNJ", "BAC", "ABBV", "CRM", "KO", "PEP", "ASML", "TMO", "MRK", "ADBE",
  "CSCO", "PM", "UNH", "XOM", "CVX", "MCD", "WFC", "IBM", "GE", "ACN",
  "TXN", "INTU", "NOW", "DIS", "ABT", "AMD", "CAT", "VZ", "PLTR", "UBER",
  "QCOM", "GS", "AXP", "BKNG", "SPGI", "RTX", "HON", "NKE", "LOW", "UPS",
  "SBUX", "BLK", "DE", "MS", "T", "AMAT", "LRCX", "ADI", "PANW", "ANET",
  "MU",
];

/**
 * What the live scan's discovery rotation walks (`lib/scan/universe-rotation.ts`,
 * via `app/api/market-scan/route.ts`): mega-caps first, then the large-cap
 * band, de-duplicated. 816 symbols as of 2026-09-26.
 *
 * Scan-time cost: none per run. The rotation scans one fixed-size chunk per
 * run (`DISCOVERY_CHUNK_SIZE`, 150), so adding names changes how many chunks
 * make a full cycle, not how many symbols a run fetches. 766 → 816 symbols is
 * still 6 chunks of at most 150, so the cycle stays 6 runs (90 minutes at the
 * 15-minute cadence); only the last chunk grows, from 16 symbols to 66, and
 * stays under the chunk size every other run already carries. This is
 * structural, not a timing measurement: confirm with the `[market-scan]`
 * `mark()` breadcrumbs after deploy (AGENTS.md, "Speed is a product
 * requirement").
 */
export const SCAN_DISCOVERY_UNIVERSE: string[] = Array.from(
  new Set([...MEGA_CAP_UNIVERSE, ...LARGE_CAP_UNIVERSE].map((s) => s.toUpperCase())),
);

/**
 * A 27-symbol diversified sample for backtest sanity checks, drawn entirely
 * from `LARGE_CAP_UNIVERSE`. Ported 2026-09-26 from the unmerged
 * `claude/great-brown-h6hops` branch so `scripts/backtest-universe.mjs
 * --universe diversified` runs on `main` (the handoff's Phase 2 names it as a
 * sanity check; before this port the script stopped with "does not exist on
 * this ref"). Backtest-only: nothing in the live scan reads it.
 *
 * Spread on purpose across the volatility spectrum and across industries:
 * high-beta/momentum names against defensive ones, so a run is not describing
 * one pole. `COIN`/`CVNA` stand in for the project owner's `BMNR`/`CRCL`
 * archetype (formerly tiny, volatile, momentum and crypto-speculator magnets),
 * because those two listed too recently to have the 120 daily bars scoring
 * needs (`MIN_DAILY_BARS_FOR_SCORE`). Swap them in once they have the history.
 *
 * Three-question mandate: (1) Gann: N/A, this is which symbols to measure,
 * not a technique. (2) Cycles: N/A, a cross-sectional sample, no periodicity
 * claim. (3) Hermetic: Polarity, both poles of the volatility spectrum held
 * in one sample; the other six do not decide sample composition.
 */
export const DIVERSIFIED_BACKTEST_SAMPLE: string[] = [
  // High-beta / momentum
  "MSTR", "HOOD", "APP", "MRNA",
  // Formerly tiny, volatile, momentum/crypto magnets (stand-ins for BMNR/CRCL)
  "COIN", "CVNA",
  // Energy
  "OXY", "DVN", "FANG",
  // Semiconductors
  "NXPI", "MPWR", "QCOM",
  // Consumer discretionary / travel
  "ABNB", "DAL", "LOW",
  // Industrials
  "BA", "DE",
  // Financials
  "SCHW", "BLK",
  // Healthcare
  "PFE", "GILD",
  // Defensive: utilities, staples
  "NEE", "SO", "PEP", "MO",
  // REIT / telecom
  "PLD", "TMUS",
];
