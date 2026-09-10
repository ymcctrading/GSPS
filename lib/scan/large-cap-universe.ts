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
 * To refresh: re-export the source list, re-run the $10B–$200B band filter,
 * and replace the array below wholesale, updating LARGE_CAP_SOURCE_CAPTURED to
 * match.
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
  "WBS", "HAS", "CORT", "BMRN", "AGNC", "TOL", "UHAL", "GLPI", "COO", "GGG",
  "BTSG", "ELS", "PSHD.L", "HALO", "BF.A", "SF", "CCK", "CPT", "DOCU", "AR",
  "MANH", "EHC", "CSGP", "FNF", "AIT", "WTRG", "WTS", "DKS", "GDDY", "GWRE",
  "HUBS", "PNW", "TXRH", "ELAN", "DKNG", "FIG", "AHR", "DVA", "ARWR", "AFG",
  "CR", "FHN", "BXP", "HRL", "SWKS", "PSKY", "AEIS", "TECH", "JEF", "KNX",
  "BJ", "DAY", "CFLT", "JKHY", "EVR", "HII", "TEM", "SANM", "AXSM", "GNRC",
  "ARW", "DECK", "ALGN", "SCI", "AM", "CLX", "CART", "FROG", "NYT", "UMBF",
  "LFUS", "IT", "DAR", "EGP", "DPZ", "RRX", "GKOS", "GSAT", "ALSN", "AES",
  "BPOP", "CGNX", "MGM", "DCI", "UHS", "PINS", "KRYS", "CYTK", "APGE", "SSB",
  "OC", "WTFC", "MOH", "RYAN", "BIO", "FRT", "AVTR", "CFR", "SOLS", "ENSG",
  "GMED",
];
