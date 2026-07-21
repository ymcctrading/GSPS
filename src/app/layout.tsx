import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GSPS — Global Scanner & Charting Platform System",
  description:
    "Robinhood-simple, thinkorswim-deep. Automated mean-reversion scanning and multi-asset charting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-[#e6e8eb] antialiased">
        {children}
      </body>
    </html>
  );
}
