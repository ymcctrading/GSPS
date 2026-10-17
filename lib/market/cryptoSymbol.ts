/**
 * Whether a symbol names a crypto pair ("BTC/USD", "BTCUSD", "BTC-USD").
 * Pure, so client code and the risk rules can read it without the data client.
 */
export function isCryptoSymbol(symbol: string): boolean {
  const knownCrypto = ["BTC", "ETH", "SOL", "DOGE", "LTC", "AVAX", "LINK", "XRP", "BCH", "UNI"];
  const base = symbol.toUpperCase().replace(/[-/]?USD[TC]?$/, "");
  return symbol.includes("/") || knownCrypto.includes(base);
}
