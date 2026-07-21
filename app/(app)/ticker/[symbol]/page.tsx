import { TickerView } from "@/components/scan/ticker-view";

export default async function TickerPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return <TickerView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
