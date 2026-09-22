import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TickerView } from "@/components/scan/ticker-view";

function TickerLoadingFallback() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div className="sticky top-14 z-30 -mx-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid min-w-0 gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardContent className="py-8">
            <div className="space-y-2">
              <div className="h-4 animate-pulse rounded bg-muted" />
              <div className="h-64 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4 sm:space-y-6">
          <Card>
            <CardContent className="py-6">
              <div className="space-y-2">
                <div className="h-4 animate-pulse rounded bg-muted" />
                <div className="h-8 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default async function TickerPage({ params }: { params: Promise<{ symbol: string[] }> }) {
  const { symbol } = await params;
  const joined = symbol.map((segment) => decodeURIComponent(segment)).join("/");
  return (
    <Suspense fallback={<TickerLoadingFallback />}>
      <TickerView symbol={joined.toUpperCase()} />
    </Suspense>
  );
}
