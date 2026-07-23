import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { getViewerTier } from "@/lib/tier";

export const metadata: Metadata = {
  title: "GSPS — The Gann Protocol Scanner",
  description:
    "Robinhood-simple, TradingView-deep multi-asset scanner and automated portfolio manager.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Nav viewerTier={getViewerTier()} />
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
