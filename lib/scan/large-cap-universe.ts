/**
 * GSPS — the large-cap scanning universe.
 *
 * US large caps, ranked by market capitalisation, from a stockanalysis.com
 * "Large-Cap Stocks" listing ($10B–$200B band) supplied on 2026-08-19.
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
 * The source listing reports 893 stocks across two pages. The supplied capture
 * contained page 1 — ranks 1 through 500, market caps from about $197.9B down
 * to about $22.5B. Ranks 501–893 (roughly $10B–$22.5B) are **not** in this file
 * yet; adding them is an append to the array below and a bump to
 * `LARGE_CAP_SOURCE_RANKS`, with no other change anywhere.
 *
 * To refresh: re-export the source list and replace the array below wholesale,
 * updating LARGE_CAP_SOURCE_CAPTURED and LARGE_CAP_SOURCE_RANKS to match.
 */

/** Where this list came from, so a future reader can tell what it covers. */
export const LARGE_CAP_SOURCE = "stockanalysis.com Large-Cap Stocks ($10B-$200B)";
export const LARGE_CAP_SOURCE_CAPTURED = "2026-08-19";
/** Ranks present in this file, out of the 893 the source reports. */
export const LARGE_CAP_SOURCE_RANKS = { from: 1, to: 500, sourceTotal: 893 } as const;

/**
 * Ordered by market capitalisation, largest first.
 *
 * The order is load-bearing. `runMarketScan` trims the combined universe to its
 * `universeTop` budget, and this list sits behind the most-actives screener in
 * that combined order — so when the budget bites, the names that survive are the
 * biggest and most liquid ones.
 *
 * A note on the symbols themselves: they are transcribed exactly as the source
 * listing published them, including tickers that may since have changed hands or
 * been renamed. They are not corrected against any other source. A symbol the
 * data provider cannot resolve returns no bars and is dropped by the coarse
 * pass, so a stale entry costs a wasted slot rather than a wrong answer — but a
 * list that has drifted far enough to lose many at once would quietly shrink the
 * universe, which is the reason to refresh it from the source rather than patch
 * it by hand.
 */
export const LARGE_CAP_UNIVERSE: string[] = [
  "TTE", "APH", "TMUS", "ABT", "SCHW", "PEP", "MRVL", "MCD", "SHOP", "BLK",
  "ADI", "NEE", "DIS", "WDC", "GILD", "UNP", "BA", "BX", "QCOM", "T",
  "WELL", "ETN", "TJX", "RIO", "SMFG", "UBS", "CRM", "BBVA", "DE", "SCCO",
  "BKNG", "COP", "PFE", "BUD", "UBER", "DHR", "LMT", "ISRG", "GLW", "SONY",
  "COF", "PLD", "BMY", "VRTX", "UL", "CB", "PH", "MFG", "BMO", "SYK",
  "PDD", "NOW", "SPGI", "NEM", "CVS", "BTI", "LOW", "SBUX", "PGR", "MDT",
  "HWM", "HDB", "FTNT", "SNOW", "PBR", "PBR.A", "ENB", "BP", "BNY", "CM",
  "BNS", "MO", "ABNB", "SNY", "NET", "EQIX", "ADP", "GD", "SPOT", "SO",
  "SOMN", "ACN", "IBN", "VRT", "PWR", "ADBE", "MPC", "APP", "GSK", "CNQ",
  "TT", "PNC", "MCK", "ING", "USB", "VLO", "EQNR", "CME", "PSX", "DUK",
  "KKR", "INTU", "FCX", "AEM", "CEG", "BN", "DASH", "MMM", "MAR", "CSX",
  "CMCSA", "MNST", "WMB", "BCS", "JCI", "MELI", "WM", "HCA", "MRSH", "LYG",
  "DDOG", "EMR", "ICE", "CDNS", "UPS", "ELV", "CMI", "MCO", "ITUB", "SPG",
  "NOC", "EPD", "SHW", "ASX", "BAM", "CP", "HOOD", "NGG", "ITW", "E",
  "REGN", "AMT", "RCL", "MDLZ", "CTAS", "RACE", "SU", "NTES", "APO", "SLB",
  "ECL", "LITE", "EOG", "FDX", "MSI", "SNPS", "TRV", "CNI", "NSC", "ROST",
  "NWG", "HLT", "ET", "HPE", "CI", "DLR", "GM", "ORLY", "KMI", "MFC",
  "BSX", "CL", "AON", "CVNA", "HON", "WBD", "SE", "DB", "AMX", "URI",
  "NU", "TGT", "B", "AEP", "TDG", "NBIS", "APD", "PCAR", "TRP", "RSG",
  "ALL", "IMO", "MPWR", "TFC", "BKR", "TRGP", "AJG", "TER", "ARGX", "CRH",
  "GWW", "PSA", "BE", "MET", "OKE", "FIX", "AFL", "D", "COR", "WPM",
  "MPLX", "RELX", "CVE", "COHR", "NUE", "OXY", "NKE", "TEL", "O", "FAST",
  "FANG", "VALE", "KEYS", "NOK", "NXPI", "CIEN", "GRMN", "AME", "TAK", "SRE",
  "LNG", "DAL", "F", "DVN", "CAH", "NDAQ", "MT", "STT", "ALAB", "EW",
  "CBRS", "ADSK", "LHX", "CTVA", "FITB", "PYPL", "HEI", "CRWV", "HONA", "DEO",
  "CARR", "ETR", "AXON", "AZO", "AU", "WAB", "AMP", "XEL", "BDX", "ROK",
  "XYZ", "CCEP", "RKLB", "FERG", "VST", "INFY", "VTR", "WDAY", "UMC", "STM",
  "EXC", "ARES", "RVMD", "HUM", "CRDO", "FER", "EBAY", "TTWO", "FNV", "NTRA",
  "SLF", "MDLN", "WDS", "FLEX", "VIK", "TRI", "ABEV", "IDXX", "IX", "ODFL",
  "HEI.A", "PRU", "PAYX", "CBRE", "TEVA", "MCHP", "HLN", "CMG", "KB", "ONC",
  "A", "KDP", "LYV", "CCJ", "HMC", "WCN", "TEAM", "IBKR", "MSCI", "DHI",
  "ED", "NTAP", "AIG", "ADM", "RKT", "YUM", "IQV", "VEEV", "WAT", "PCG",
  "SYY", "ROP", "P", "JD", "COIN", "EXPE", "UAL", "IRM", "PEG", "HIG",
  "CCL", "VOD", "FMX", "HSY", "GFI", "ESLT", "EME", "TKO", "EC", "MTB",
  "WEC", "KVUE", "ALC", "KMB", "STLD", "SHG", "CLS", "HBAN", "TWLO", "MSTR",
  "VG", "JBL", "UI", "VMC", "MDB", "RYAAY", "NTRS", "QSR", "PUK", "KR",
  "RJF", "RPRX", "DXCM", "ACGL", "ERIC", "CHT", "CQP", "EQT", "NTR", "GEHC",
  "EXR", "SUNB", "CNC", "KGC", "RMD", "CASY", "CCI", "BIIB", "MLM", "TECK",
  "IR", "CFG", "ON", "ATI", "TDY", "BIDU", "ZM", "FTI", "BBD", "ALNY",
  "ZTS", "EL", "WTW", "RDDT", "CBOE", "AEE", "ZS", "LVS", "KHC", "BAP",
  "DTE", "CPRT", "LPLA", "FOXA", "HAL", "ATO", "FTS", "PBA", "VICI", "NMR",
  "ILMN", "WSM", "EIX", "TCOM", "INSM", "MTD", "CPNG", "Q", "FISV", "HPQ",
  "GFS", "DOV", "FE", "WRB", "FOX", "ES", "TSEM", "AWK", "RF", "ROIV",
  "RBLX", "PPL", "OTIS", "TS", "CPAY", "CNP", "DG", "NVT", "XYL", "PHG",
  "TPR", "CRS", "CINF", "SYF", "ECHO", "LH", "ASTS", "DGX", "CTSH", "SN",
  "JBHT", "CW", "HUBB", "CIB", "TPL", "MRNA", "PPG", "DLTR", "INCY", "OKTA",
  "VRSN", "FCNCA", "DRI", "SW", "TW", "AFRM", "SYM", "WST", "KEY", "AMRZ",
  "NRG", "PFG", "SMCI", "EXPD", "GPN", "XPO", "OMC", "FSLR", "PHM", "ARXS",
  "IHG", "TROW", "CHD", "VLTO", "ROKU", "BNTX", "FICO", "BSP", "VRSK", "BRO",
  "USFD", "AER", "IOT", "KOF", "L", "ENTG", "SOFI", "STE", "BEP", "RL",
];
