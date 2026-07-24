import type { Metadata } from "next";
import { PublicChart } from "@/components/chart/public-chart";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const sym = decodeURIComponent(symbol).toUpperCase();
  return {
    title: `${sym} chart — GSPS`,
    description: `Live ${sym} chart with Gann geometry, Strat levels, options and Level II — shared via GSPS.`,
  };
}

export default async function PublicChartPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <PublicChart symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
