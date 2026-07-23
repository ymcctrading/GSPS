import { ChartScreen } from "@/components/chart/ChartScreen";

export const dynamic = "force-dynamic";

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<{ ticker?: string }>;
}) {
  const { ticker } = await searchParams;
  return <ChartScreen symbol={(ticker ?? "SPY").toUpperCase()} />;
}
