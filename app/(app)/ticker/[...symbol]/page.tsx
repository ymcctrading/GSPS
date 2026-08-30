import { Suspense } from "react";
import { TickerView } from "@/components/scan/ticker-view";

export default async function TickerPage({ params }: { params: Promise<{ symbol: string[] }> }) {
  const { symbol } = await params;
  const joined = symbol.map((segment) => decodeURIComponent(segment)).join("/");
  return (
    <Suspense>
      <TickerView symbol={joined.toUpperCase()} />
    </Suspense>
  );
}
