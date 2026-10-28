/**
 * Guiding questions for a learner who doesn't know which markets to pick
 * (owner, 2026-10-28: "name three items in your house that you would be unable
 * to go 24 hours without"). Each answer is an everyday product or service;
 * each maps to the public companies behind it, every one a stock the scanner
 * covers (`LARGE_CAP_UNIVERSE`, guarded in the test). The picker shows them as
 * "companies behind these products", never as advice to buy.
 *
 * Engineering choices, labelled: the questions, the answers offered and the
 * company each maps to are a hand-written list; a product made by several
 * companies lists up to three.
 *
 * Three-question basis: 1. Method: none needed; this is onboarding. 2. Cycles:
 * no claim. 3. Hermetic: Mentalism, the learner starts from what they already
 * know and use. Law of Creation: what the learner uses ⊗ the market, a
 * familiar product seen as a company with a chart.
 */

export interface PickAnswer {
  id: string;
  label: string;
  /** Up to three companies behind it, by ticker. */
  companies: { symbol: string; name: string }[];
}

export interface PickQuestion {
  id: string;
  question: string;
  answers: PickAnswer[];
}

export const PICK_QUESTIONS: readonly PickQuestion[] = [
  {
    id: "cant-live-without",
    question: "Name three things in your home you couldn't go 24 hours without.",
    answers: [
      { id: "phone", label: "My phone", companies: [{ symbol: "AAPL", name: "Apple" }, { symbol: "QCOM", name: "Qualcomm" }, { symbol: "VZ", name: "Verizon" }] },
      { id: "computer", label: "My computer", companies: [{ symbol: "MSFT", name: "Microsoft" }, { symbol: "AAPL", name: "Apple" }, { symbol: "NVDA", name: "Nvidia" }] },
      { id: "tv", label: "TV and streaming", companies: [{ symbol: "NFLX", name: "Netflix" }, { symbol: "DIS", name: "Disney" }, { symbol: "ROKU", name: "Roku" }] },
      { id: "games", label: "My games console", companies: [{ symbol: "SONY", name: "Sony" }, { symbol: "MSFT", name: "Microsoft" }, { symbol: "TTWO", name: "Take-Two" }] },
      { id: "internet", label: "Internet and search", companies: [{ symbol: "GOOGL", name: "Alphabet" }, { symbol: "CMCSA", name: "Comcast" }, { symbol: "CHTR", name: "Charter" }] },
      { id: "coffee", label: "Coffee", companies: [{ symbol: "SBUX", name: "Starbucks" }] },
      { id: "fridge", label: "Food in the fridge", companies: [{ symbol: "WMT", name: "Walmart" }, { symbol: "COST", name: "Costco" }, { symbol: "KR", name: "Kroger" }] },
      { id: "drinks", label: "Soft drinks and snacks", companies: [{ symbol: "KO", name: "Coca-Cola" }, { symbol: "PEP", name: "PepsiCo" }, { symbol: "MDLZ", name: "Mondelez" }] },
      { id: "medicine", label: "My medicine", companies: [{ symbol: "JNJ", name: "Johnson & Johnson" }, { symbol: "LLY", name: "Eli Lilly" }, { symbol: "PFE", name: "Pfizer" }] },
      { id: "household", label: "Soap, toothpaste and paper towels", companies: [{ symbol: "PG", name: "Procter & Gamble" }, { symbol: "CL", name: "Colgate-Palmolive" }, { symbol: "KMB", name: "Kimberly-Clark" }] },
    ],
  },
  {
    id: "spend-time",
    question: "Where do you spend your time and money most weeks?",
    answers: [
      { id: "social", label: "Social media", companies: [{ symbol: "META", name: "Meta" }, { symbol: "PINS", name: "Pinterest" }] },
      { id: "shopping", label: "Online shopping", companies: [{ symbol: "AMZN", name: "Amazon" }, { symbol: "EBAY", name: "eBay" }, { symbol: "SHOP", name: "Shopify" }] },
      { id: "music", label: "Music", companies: [{ symbol: "SPOT", name: "Spotify" }] },
      { id: "fast-food", label: "Eating out", companies: [{ symbol: "MCD", name: "McDonald's" }, { symbol: "CMG", name: "Chipotle" }, { symbol: "YUM", name: "Yum! Brands" }] },
      { id: "home", label: "Fixing up the home", companies: [{ symbol: "HD", name: "Home Depot" }, { symbol: "LOW", name: "Lowe's" }] },
      { id: "sneakers", label: "Sneakers and sportswear", companies: [{ symbol: "NKE", name: "Nike" }] },
      { id: "rides", label: "Rides and food delivery", companies: [{ symbol: "UBER", name: "Uber" }] },
      { id: "travel", label: "Travel", companies: [{ symbol: "ABNB", name: "Airbnb" }, { symbol: "BKNG", name: "Booking" }, { symbol: "DAL", name: "Delta" }] },
    ],
  },
  {
    id: "get-around",
    question: "How do you get around and pay for things?",
    answers: [
      { id: "car", label: "My car", companies: [{ symbol: "TSLA", name: "Tesla" }, { symbol: "F", name: "Ford" }, { symbol: "GM", name: "General Motors" }] },
      { id: "fuel", label: "Gas for the car", companies: [{ symbol: "XOM", name: "Exxon Mobil" }, { symbol: "CVX", name: "Chevron" }] },
      { id: "card", label: "My debit or credit card", companies: [{ symbol: "V", name: "Visa" }, { symbol: "MA", name: "Mastercard" }, { symbol: "AXP", name: "American Express" }] },
      { id: "pay-app", label: "Payment apps", companies: [{ symbol: "PYPL", name: "PayPal" }] },
    ],
  },
];

/** Companies behind the chosen answers, first mention first, without repeats. */
export function suggestionsFor(answerIds: readonly string[]): { symbol: string; name: string; because: string }[] {
  const out: { symbol: string; name: string; because: string }[] = [];
  const seen = new Set<string>();
  for (const id of answerIds) {
    for (const q of PICK_QUESTIONS) {
      const a = q.answers.find((x) => x.id === id);
      if (!a) continue;
      for (const c of a.companies) {
        if (seen.has(c.symbol)) continue;
        seen.add(c.symbol);
        out.push({ ...c, because: a.label });
      }
    }
  }
  return out;
}

/** Broad markets offered beside the companies, so a learner can follow the whole market too. */
export const MARKET_SUGGESTIONS: readonly { symbol: string; name: string }[] = [
  { symbol: "SPY", name: "S&P 500 fund (the broad US market)" },
  { symbol: "QQQ", name: "Nasdaq-100 fund" },
  { symbol: "BTC/USD", name: "Bitcoin" },
  { symbol: "ETH/USD", name: "Ether" },
];
