import { TickerView } from "@/components/scan/ticker-view";
import { symbolFromRoute } from "@/lib/market/symbol-route";

export default async function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <TickerView symbol={symbolFromRoute(symbol)} />;
}
