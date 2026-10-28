/**
 * Every symbol on the platform, sorted into a sector and an industry a person
 * can pick from, so nobody has to work out a stock's industry for themselves.
 *
 * Stocks: the scan universe (`LARGE_CAP_UNIVERSE`, $10B floor, no ceiling) is
 * classified from each company's SEC industry code (SIC, `industryGroups.json`,
 * the same checked-in map the group rank reads), through `SIC_RULES` below, with
 * `OVERRIDES` for the companies SEC files under a code that misdescribes their
 * business today (Alphabet as "computer programming", ConocoPhillips as a
 * refiner, Qualcomm as broadcasting equipment, 3M as surgical instruments).
 * Funds, crypto, futures and forex come from their own lists
 * (`lib/market/otherMarkets.ts`, `lib/scan/cryptoUniverse.ts`,
 * `lib/instruments/spec.ts`), so a symbol added there joins its industry here.
 *
 * Gann's groups were industries (the Motors, Rails, Oils, Coppers: *Truth of
 * the Stock Tape* Ch. XVI-XIX), and he chose his stocks group by group. The
 * names of the sectors and industries are GSPS's own plain-English labels, an
 * engineering choice; the score's group rank (`lib/gann/industryGroups.ts`) is
 * unchanged and still reads the SIC codes.
 *
 * Three questions: 1. S4 (groups as industries), Tier A, as cited; no rule is
 * read from it here, only the grouping. 2. No period is claimed; Dewey does not
 * apply. 3. Correspondence: a stock is read with those of its own kind.
 */

import sicData from "@/lib/gann/industryGroups.json";
import { LARGE_CAP_UNIVERSE } from "@/lib/scan/large-cap-universe";
import { COMMODITY_FUNDS, CURRENCY_FUNDS } from "@/lib/market/otherMarkets";
import { CRYPTO_UNIVERSE } from "@/lib/scan/cryptoUniverse";
import { FUTURES_CONTRACTS } from "@/lib/instruments/spec";

export const SECTOR_LABELS = {
  technology: "Technology",
  communication: "Communication & media",
  discretionary: "Consumer discretionary",
  staples: "Consumer staples",
  health: "Health care",
  financials: "Financials",
  realEstate: "Real estate",
  energy: "Energy",
  utilities: "Utilities",
  industrials: "Industrials",
  materials: "Materials",
  funds: "Funds (ETFs)",
  crypto: "Crypto",
  futures: "Futures",
  forex: "Forex",
} as const;

export type SectorKey = keyof typeof SECTOR_LABELS;

/** Industry key -> its label and sector. Order is display order within a sector. */
export const INDUSTRIES = {
  // Technology
  semiconductors: { label: "Semiconductors", sector: "technology" },
  semiEquipment: { label: "Semiconductor equipment & materials", sector: "technology" },
  software: { label: "Software & cloud", sector: "technology" },
  cybersecurity: { label: "Cybersecurity", sector: "technology" },
  itServices: { label: "IT services & consulting", sector: "technology" },
  hardware: { label: "Computers, storage & hardware", sector: "technology" },
  networking: { label: "Networking & communications equipment", sector: "technology" },
  electronics: { label: "Electronic components & manufacturing", sector: "technology" },
  instruments: { label: "Measurement instruments & industrial tech", sector: "technology" },
  // Communication & media
  interactiveMedia: { label: "Internet search & social media", sector: "communication" },
  media: { label: "Media, streaming & entertainment", sector: "communication" },
  games: { label: "Video games", sector: "communication" },
  telecom: { label: "Telecom, cable & satellite", sector: "communication" },
  // Consumer discretionary
  ecommerce: { label: "E-commerce & delivery", sector: "discretionary" },
  autos: { label: "Autos, EVs & auto parts", sector: "discretionary" },
  autoRetail: { label: "Auto retail & parts stores", sector: "discretionary" },
  homebuilders: { label: "Homebuilders", sector: "discretionary" },
  specialtyRetail: { label: "Home improvement & specialty retail", sector: "discretionary" },
  apparel: { label: "Apparel & footwear", sector: "discretionary" },
  restaurants: { label: "Restaurants", sector: "discretionary" },
  travel: { label: "Hotels, travel & cruises", sector: "discretionary" },
  gaming: { label: "Casinos & betting", sector: "discretionary" },
  leisure: { label: "Household durables & leisure products", sector: "discretionary" },
  // Consumer staples
  beverages: { label: "Beverages", sector: "staples" },
  food: { label: "Food & agricultural products", sector: "staples" },
  tobacco: { label: "Tobacco", sector: "staples" },
  householdProducts: { label: "Household & personal products", sector: "staples" },
  discountStores: { label: "Discount & warehouse stores", sector: "staples" },
  staplesRetail: { label: "Grocery & convenience stores", sector: "staples" },
  foodDistributors: { label: "Food distributors", sector: "staples" },
  // Health care
  pharma: { label: "Pharmaceuticals", sector: "health" },
  biotech: { label: "Biotechnology", sector: "health" },
  medDevices: { label: "Medical devices & supplies", sector: "health" },
  lifeScience: { label: "Life science tools & diagnostics", sector: "health" },
  managedCare: { label: "Health insurers", sector: "health" },
  healthServices: { label: "Hospitals, pharmacies & care services", sector: "health" },
  healthDistributors: { label: "Health care distributors", sector: "health" },
  // Financials
  banksUs: { label: "Banks (US)", sector: "financials" },
  banksIntl: { label: "Banks (international)", sector: "financials" },
  brokers: { label: "Investment banks & brokers", sector: "financials" },
  assetManagers: { label: "Asset managers & private equity", sector: "financials" },
  exchanges: { label: "Exchanges", sector: "financials" },
  financialData: { label: "Financial data & ratings", sector: "financials" },
  payments: { label: "Payments & card networks", sector: "financials" },
  consumerFinance: { label: "Consumer finance & fintech", sector: "financials" },
  cryptoFinance: { label: "Crypto-linked companies", sector: "financials" },
  insurancePc: { label: "Insurance (property & casualty)", sector: "financials" },
  insuranceLife: { label: "Insurance (life & health)", sector: "financials" },
  insuranceBrokers: { label: "Insurance brokers", sector: "financials" },
  // Real estate
  reitTowers: { label: "REITs: towers & data centers", sector: "realEstate" },
  reitResidential: { label: "REITs: residential", sector: "realEstate" },
  reitRetail: { label: "REITs: retail", sector: "realEstate" },
  reitIndustrial: { label: "REITs: industrial & storage", sector: "realEstate" },
  reitHealth: { label: "REITs: health care", sector: "realEstate" },
  reitMortgage: { label: "REITs: mortgage", sector: "realEstate" },
  reitSpecialty: { label: "REITs: gaming, hotel, net lease & specialty", sector: "realEstate" },
  reitOther: { label: "REITs: office & other", sector: "realEstate" },
  realEstateServices: { label: "Real estate services", sector: "realEstate" },
  // Energy
  integratedOil: { label: "Integrated oil majors", sector: "energy" },
  oilGasProducers: { label: "Oil & gas producers", sector: "energy" },
  refiners: { label: "Refiners", sector: "energy" },
  midstream: { label: "Pipelines, LNG & midstream", sector: "energy" },
  oilfieldServices: { label: "Oilfield services & equipment", sector: "energy" },
  uranium: { label: "Uranium & nuclear fuel", sector: "energy" },
  cleanEnergy: { label: "Solar & clean energy", sector: "energy" },
  // Utilities
  electricUtilities: { label: "Electric utilities & power producers", sector: "utilities" },
  gasWaterUtilities: { label: "Gas & water utilities", sector: "utilities" },
  // Industrials
  aerospace: { label: "Aerospace & defense", sector: "industrials" },
  airlines: { label: "Airlines", sector: "industrials" },
  railroads: { label: "Railroads", sector: "industrials" },
  logistics: { label: "Trucking, freight & logistics", sector: "industrials" },
  machinery: { label: "Machinery, trucks & tools", sector: "industrials" },
  electrical: { label: "Electrical equipment & power systems", sector: "industrials" },
  buildingProducts: { label: "Building products & HVAC", sector: "industrials" },
  construction: { label: "Construction & engineering", sector: "industrials" },
  distribution: { label: "Industrial distribution & equipment rental", sector: "industrials" },
  waste: { label: "Waste & environmental services", sector: "industrials" },
  businessServices: { label: "Business & professional services", sector: "industrials" },
  conglomerates: { label: "Industrial conglomerates", sector: "industrials" },
  // Materials
  chemicals: { label: "Chemicals & coatings", sector: "materials" },
  fertilizers: { label: "Fertilizers & crop inputs", sector: "materials" },
  metals: { label: "Metals, mining & steel", sector: "materials" },
  goldSilver: { label: "Gold & silver miners", sector: "materials" },
  constructionMaterials: { label: "Cement & construction materials", sector: "materials" },
  packaging: { label: "Packaging & paper", sector: "materials" },
  // Funds
  indexFunds: { label: "Index funds", sector: "funds" },
  commodityFunds: { label: "Commodity funds", sector: "funds" },
  currencyFunds: { label: "Currency funds", sector: "funds" },
  // Crypto
  cryptoPairs: { label: "Crypto (USD pairs)", sector: "crypto" },
  // Futures
  futuresIndex: { label: "Stock index futures", sector: "futures" },
  futuresEnergy: { label: "Energy futures", sector: "futures" },
  futuresMetals: { label: "Metal futures", sector: "futures" },
  futuresGrains: { label: "Grain futures", sector: "futures" },
  futuresSofts: { label: "Soft commodity futures", sector: "futures" },
  futuresRates: { label: "Interest rate futures", sector: "futures" },
  futuresCurrency: { label: "Currency futures", sector: "futures" },
  // Forex
  forexMajors: { label: "Major pairs", sector: "forex" },
  forexCrosses: { label: "Cross pairs", sector: "forex" },
} as const satisfies Record<string, { label: string; sector: SectorKey }>;

export type IndustryKey = keyof typeof INDUSTRIES;

/**
 * SIC code -> industry, first match wins. `[from, to]` is an inclusive range of
 * four-digit codes. Ordered narrowest first.
 */
const SIC_RULES: [number, number, IndustryKey][] = [
  [100, 999, "fertilizers"],
  [1000, 1039, "metals"],
  [1040, 1049, "goldSilver"],
  [1090, 1099, "metals"],
  [1300, 1319, "oilGasProducers"],
  [1380, 1389, "oilfieldServices"],
  [1400, 1499, "constructionMaterials"],
  [1500, 1531, "homebuilders"],
  [1600, 1799, "construction"],
  [2000, 2079, "food"],
  [2080, 2089, "beverages"],
  [2090, 2099, "food"],
  [2100, 2199, "tobacco"],
  [2200, 2399, "apparel"],
  [2400, 2599, "leisure"],
  [2600, 2699, "packaging"],
  [2700, 2799, "media"],
  [2834, 2834, "biotech"],
  [2835, 2835, "medDevices"],
  [2836, 2836, "biotech"],
  [2840, 2844, "householdProducts"],
  [2870, 2879, "fertilizers"],
  [2800, 2899, "chemicals"],
  [2900, 2999, "refiners"],
  [3020, 3029, "apparel"],
  [3000, 3099, "chemicals"],
  [3100, 3199, "apparel"],
  [3200, 3299, "constructionMaterials"],
  [3300, 3399, "metals"],
  [3410, 3419, "packaging"],
  [3400, 3429, "machinery"],
  [3430, 3449, "buildingProducts"],
  [3480, 3489, "aerospace"],
  [3400, 3499, "machinery"],
  [3533, 3533, "oilfieldServices"],
  [3559, 3559, "semiEquipment"],
  [3570, 3575, "hardware"],
  [3576, 3576, "networking"],
  [3577, 3579, "hardware"],
  [3580, 3589, "buildingProducts"],
  [3500, 3599, "machinery"],
  [3630, 3659, "leisure"],
  [3660, 3669, "networking"],
  [3674, 3674, "semiconductors"],
  [3670, 3679, "electronics"],
  [3600, 3699, "electrical"],
  [3710, 3719, "autos"],
  [3720, 3729, "aerospace"],
  [3730, 3739, "aerospace"],
  [3740, 3749, "machinery"],
  [3760, 3769, "aerospace"],
  [3812, 3812, "aerospace"],
  [3826, 3826, "lifeScience"],
  [3827, 3827, "electronics"],
  [3840, 3851, "medDevices"],
  [3800, 3899, "instruments"],
  [3900, 3999, "leisure"],
  [4000, 4099, "railroads"],
  [4100, 4299, "logistics"],
  [4400, 4499, "travel"],
  [4510, 4512, "airlines"],
  [4513, 4599, "logistics"],
  [4600, 4699, "midstream"],
  [4700, 4729, "travel"],
  [4730, 4799, "logistics"],
  [4800, 4829, "telecom"],
  [4830, 4839, "media"],
  [4840, 4899, "telecom"],
  [4920, 4924, "midstream"],
  [4900, 4919, "electricUtilities"],
  [4930, 4931, "electricUtilities"],
  [4932, 4949, "gasWaterUtilities"],
  [4950, 4959, "waste"],
  [4960, 4999, "electricUtilities"],
  [5013, 5013, "autoRetail"],
  [5030, 5039, "buildingProducts"],
  [5045, 5045, "itServices"],
  [5051, 5051, "metals"],
  [5065, 5065, "electronics"],
  [5120, 5129, "healthDistributors"],
  [5140, 5149, "foodDistributors"],
  [5000, 5199, "distribution"],
  [5200, 5299, "specialtyRetail"],
  [5300, 5399, "discountStores"],
  [5400, 5499, "staplesRetail"],
  [5500, 5599, "autoRetail"],
  [5600, 5699, "specialtyRetail"],
  [5700, 5799, "specialtyRetail"],
  [5800, 5899, "restaurants"],
  [5910, 5919, "healthServices"],
  [5961, 5961, "ecommerce"],
  [5900, 5999, "specialtyRetail"],
  [6021, 6036, "banksUs"],
  [6140, 6199, "consumerFinance"],
  [6200, 6209, "exchanges"],
  [6210, 6219, "brokers"],
  [6280, 6299, "assetManagers"],
  [6310, 6319, "insuranceLife"],
  [6320, 6323, "insuranceLife"],
  [6324, 6324, "managedCare"],
  [6330, 6399, "insurancePc"],
  [6400, 6499, "insuranceBrokers"],
  [6500, 6599, "realEstateServices"],
  [6792, 6792, "oilGasProducers"],
  [6795, 6795, "goldSilver"],
  [6798, 6798, "reitOther"],
  [7000, 7099, "travel"],
  [7310, 7319, "media"],
  [7320, 7329, "financialData"],
  [7350, 7359, "distribution"],
  [7370, 7373, "software"],
  [7374, 7374, "businessServices"],
  [7200, 7399, "businessServices"],
  [7500, 7599, "distribution"],
  [7800, 7899, "media"],
  [7900, 7999, "media"],
  [8000, 8069, "healthServices"],
  [8070, 8079, "lifeScience"],
  [8080, 8099, "healthServices"],
  [8730, 8731, "lifeScience"],
  [8000, 8999, "businessServices"],
];

/**
 * Companies SEC files under a code that misdescribes their business today, and
 * the splits the SIC codes don't make (US and foreign banks, the kinds of
 * REIT, big pharma from biotech). Read before the SIC rules.
 */
const OVERRIDES: Partial<Record<string, IndustryKey>> = {
  // Technology
  QCOM: "semiconductors",
  ASML: "semiEquipment", LRCX: "semiEquipment", AMAT: "semiEquipment", KLAC: "semiEquipment",
  ONTO: "semiEquipment", TER: "semiEquipment", ENTG: "semiEquipment", MKSI: "semiEquipment",
  CRWD: "cybersecurity", PANW: "cybersecurity", FTNT: "cybersecurity", ZS: "cybersecurity",
  OKTA: "cybersecurity", GEN: "cybersecurity", RBRK: "cybersecurity", CHKP: "cybersecurity",
  CYBR: "cybersecurity",
  VRSN: "software", AKAM: "software", WDAY: "software", ROP: "software",
  ACN: "itServices", CTSH: "itServices", INFY: "itServices", IBM: "itServices", CACI: "itServices",
  LDOS: "itServices", IT: "itServices", CDW: "itServices", EPAM: "itServices",
  IONQ: "hardware", AUR: "autos",
  ARW: "electronics", TEL: "electronics", GLW: "electronics", LFUS: "electronics", COHR: "electronics",
  ZBRA: "instruments", ROK: "electrical", TRMB: "instruments", TDY: "instruments", VLTO: "instruments",
  // Communication & media
  GOOG: "interactiveMedia", GOOGL: "interactiveMedia", META: "interactiveMedia", PINS: "interactiveMedia",
  BIDU: "interactiveMedia", RDDT: "interactiveMedia", SNAP: "interactiveMedia",
  TTWO: "games", RBLX: "games", NTES: "games", EA: "games", U: "games",
  NFLX: "media", DIS: "media", SPOT: "media", OMC: "media", ROKU: "media", WBD: "media",
  TRI: "businessServices",
  // Consumer discretionary
  AMZN: "ecommerce", BABA: "ecommerce", PDD: "ecommerce", JD: "ecommerce", MELI: "ecommerce",
  EBAY: "ecommerce", SE: "ecommerce", CPNG: "ecommerce", W: "ecommerce", ETSY: "ecommerce",
  DASH: "ecommerce", UBER: "ecommerce", CART: "ecommerce", LYFT: "ecommerce", SHOP: "ecommerce",
  BKNG: "travel", EXPE: "travel", ABNB: "travel", TCOM: "travel",
  LVS: "gaming", MGM: "gaming", WYNN: "gaming", DKNG: "gaming", FLUT: "gaming",
  CPRT: "autoRetail", CVNA: "autoRetail", PAG: "autoRetail", KMX: "autoRetail",
  TSCO: "specialtyRetail", BURL: "specialtyRetail", FIVE: "specialtyRetail", DPZ: "restaurants", YUM: "restaurants",
  GRMN: "leisure", SONY: "leisure", SN: "leisure", HAS: "leisure",
  CTAS: "businessServices",
  // Consumer staples
  CASY: "staplesRetail", KMB: "householdProducts", ADM: "food", BG: "food", DAR: "food",
  // Health care
  ABBV: "pharma", AZN: "pharma", BMY: "pharma", GSK: "pharma", JNJ: "pharma", LLY: "pharma",
  MRK: "pharma", NVS: "pharma", PFE: "pharma", SNY: "pharma", TAK: "pharma", TEVA: "pharma",
  VTRS: "pharma", ZTS: "pharma", ELAN: "pharma", RPRX: "pharma", NVO: "pharma",
  ABT: "medDevices", GEHC: "medDevices", PHG: "medDevices",
  TMO: "lifeScience", DHR: "lifeScience", IQV: "lifeScience", TECH: "lifeScience",
  INCY: "biotech", TEM: "lifeScience",
  // Financials
  MFG: "banksIntl", SHG: "banksIntl", UBS: "banksIntl", BBD: "banksIntl", BNS: "banksIntl",
  DB: "banksIntl", ITUB: "banksIntl", BAP: "banksIntl", BBVA: "banksIntl", BCS: "banksIntl",
  BMO: "banksIntl", CIB: "banksIntl", CM: "banksIntl", HDB: "banksIntl", IBN: "banksIntl",
  ING: "banksIntl", KB: "banksIntl", LYG: "banksIntl", NWG: "banksIntl", RY: "banksIntl",
  SMFG: "banksIntl", HSBC: "banksIntl", TD: "banksIntl", SAN: "banksIntl", MUFG: "banksIntl",
  NU: "consumerFinance", BPOP: "banksUs",
  V: "payments", MA: "payments", PYPL: "payments", FIS: "payments", FISV: "payments", GPN: "payments",
  CPAY: "payments", XYZ: "payments", TOST: "payments", AFRM: "consumerFinance",
  COIN: "cryptoFinance", MSTR: "cryptoFinance", BMNR: "cryptoFinance", CRCL: "cryptoFinance",
  MSCI: "financialData", FICO: "financialData", BR: "financialData", VRSK: "financialData",
  FDS: "financialData",
  LPLA: "brokers", EVR: "brokers", BLK: "assetManagers", SEIC: "assetManagers",
  BN: "assetManagers", ARCC: "assetManagers", IX: "consumerFinance",
  EQH: "insuranceLife",
  // Real estate
  AMT: "reitTowers", CCI: "reitTowers", SBAC: "reitTowers", EQIX: "reitTowers", DLR: "reitTowers",
  IRM: "reitTowers",
  AMH: "reitResidential", CPT: "reitResidential", ELS: "reitResidential", ESS: "reitResidential",
  INVH: "reitResidential", MAA: "reitResidential", SUI: "reitResidential", UDR: "reitResidential",
  EQR: "reitResidential", AVB: "reitResidential",
  FRT: "reitRetail", KIM: "reitRetail", O: "reitRetail", REG: "reitRetail", SPG: "reitRetail",
  EGP: "reitIndustrial", PLD: "reitIndustrial", PSA: "reitIndustrial", EXR: "reitIndustrial",
  CUBE: "reitIndustrial",
  AHR: "reitHealth", DOC: "reitHealth", OHI: "reitHealth", VTR: "reitHealth", WELL: "reitHealth",
  AGNC: "reitMortgage", NLY: "reitMortgage",
  VICI: "reitSpecialty", GLPI: "reitSpecialty", WPC: "reitSpecialty", HST: "reitSpecialty",
  WY: "reitSpecialty", LAMR: "reitSpecialty",
  CSGP: "realEstateServices",
  // Energy
  XOM: "integratedOil", CVX: "integratedOil", BP: "integratedOil", SHEL: "integratedOil",
  TTE: "integratedOil", EQNR: "integratedOil", SU: "integratedOil", IMO: "integratedOil",
  CVE: "integratedOil", E: "integratedOil", PBR: "integratedOil", EC: "integratedOil",
  COP: "oilGasProducers",
  DINO: "refiners", PBA: "midstream",
  SUN: "midstream", VG: "midstream", LNG: "midstream", CQP: "midstream",
  TS: "oilfieldServices",
  CCJ: "uranium",
  FSLR: "cleanEnergy", NXT: "cleanEnergy", ENPH: "cleanEnergy", BEP: "cleanEnergy", BE: "cleanEnergy",
  // Utilities
  NGG: "gasWaterUtilities", ATO: "gasWaterUtilities", NI: "gasWaterUtilities",
  // Industrials
  GE: "aerospace", CW: "aerospace", HWM: "aerospace", BWXT: "aerospace", WWD: "aerospace",
  MMM: "conglomerates", HON: "conglomerates",
  PCAR: "machinery", OTIS: "machinery",
  ETN: "electrical", VRT: "electrical", HUBB: "electrical", NVT: "electrical", AME: "electrical",
  TT: "buildingProducts", CSL: "buildingProducts", OC: "buildingProducts", FERG: "buildingProducts",
  WSO: "buildingProducts", BLDR: "buildingProducts",
  FAST: "distribution", GWW: "distribution",
  XPO: "logistics", UPS: "logistics",
  ADP: "businessServices", PAYX: "businessServices", RELX: "businessServices", ROL: "businessServices",
  APG: "construction",
  // Materials
  SHW: "chemicals", ECL: "chemicals", CTVA: "fertilizers",
  HL: "goldSilver", TECK: "metals",
  MLM: "constructionMaterials", VMC: "constructionMaterials",
  AVY: "packaging",
};

type SicEntry = { sic: string; description: string };
const SIC = (sicData as { groups: Record<string, SicEntry> }).groups;

function industryForSic(sic: string): IndustryKey | null {
  const n = Number(sic);
  if (!Number.isFinite(n)) return null;
  for (const [from, to, key] of SIC_RULES) if (n >= from && n <= to) return key;
  return null;
}

const MAJOR_CURRENCIES = ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD"];
/** The forex pairs the platform lists: the USD majors, then the crosses. */
export const FOREX_PAIRS: readonly string[] = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD", "AUDUSD", "NZDUSD", "EURJPY",
];

const FUTURES_GROUP: Record<(typeof FUTURES_CONTRACTS)[number]["group"], IndustryKey> = {
  index: "futuresIndex",
  energy: "futuresEnergy",
  metal: "futuresMetals",
  grain: "futuresGrains",
  soft: "futuresSofts",
  rate: "futuresRates",
  currency: "futuresCurrency",
};

const INDEX_FUNDS = ["SPY", "QQQ", "IWM", "DIA"];

/** Every classified symbol, in the order its list holds them (stocks by market cap). */
function buildMap(): Map<string, IndustryKey> {
  const map = new Map<string, IndustryKey>();
  for (const symbol of LARGE_CAP_UNIVERSE) {
    const up = symbol.toUpperCase();
    const key = OVERRIDES[up] ?? (SIC[up] ? industryForSic(SIC[up].sic) : null);
    if (key) map.set(up, key);
  }
  for (const s of INDEX_FUNDS) map.set(s, "indexFunds");
  for (const s of COMMODITY_FUNDS) map.set(s, "commodityFunds");
  for (const s of CURRENCY_FUNDS) map.set(s, "currencyFunds");
  for (const s of CRYPTO_UNIVERSE) map.set(s, "cryptoPairs");
  for (const c of FUTURES_CONTRACTS) map.set(`/${c.root}`, FUTURES_GROUP[c.group]);
  for (const p of FOREX_PAIRS) {
    const usd = p.startsWith("USD") || p.endsWith("USD");
    const majors = MAJOR_CURRENCIES.includes(p.slice(0, 3)) || MAJOR_CURRENCIES.includes(p.slice(3));
    map.set(p, usd && majors ? "forexMajors" : "forexCrosses");
  }
  return map;
}

const SYMBOL_INDUSTRY = buildMap();

export interface SymbolIndustry {
  key: IndustryKey;
  label: string;
  sector: SectorKey;
  sectorLabel: string;
}

/** A symbol's industry, or null when the platform doesn't list it. */
export function industryOf(symbol: string): SymbolIndustry | null {
  const key = SYMBOL_INDUSTRY.get(symbol.toUpperCase().trim());
  if (!key) return null;
  const { label, sector } = INDUSTRIES[key];
  return { key, label, sector, sectorLabel: SECTOR_LABELS[sector] };
}

/** Every symbol in an industry, stocks largest first. */
export function industryMembers(key: IndustryKey): string[] {
  const out: string[] = [];
  for (const [symbol, k] of SYMBOL_INDUSTRY) if (k === key) out.push(symbol);
  return out;
}

export interface IndustryNode {
  key: IndustryKey;
  label: string;
  symbols: string[];
}

export interface SectorNode {
  key: SectorKey;
  label: string;
  industries: IndustryNode[];
}

/** The whole tree, sectors in `SECTOR_LABELS` order, empty industries left out. */
export function industryTree(): SectorNode[] {
  return (Object.keys(SECTOR_LABELS) as SectorKey[])
    .map((sector) => ({
      key: sector,
      label: SECTOR_LABELS[sector],
      industries: (Object.keys(INDUSTRIES) as IndustryKey[])
        .filter((k) => INDUSTRIES[k].sector === sector)
        .map((k) => ({ key: k, label: INDUSTRIES[k].label, symbols: industryMembers(k) }))
        .filter((n) => n.symbols.length > 0),
    }))
    .filter((s) => s.industries.length > 0);
}

export function isIndustryKey(key: string): key is IndustryKey {
  return Object.prototype.hasOwnProperty.call(INDUSTRIES, key);
}

/** Every listed symbol, for checks that the whole platform is covered. */
export function classifiedSymbols(): string[] {
  return [...SYMBOL_INDUSTRY.keys()];
}
