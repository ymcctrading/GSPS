import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GSPS — Structural Reversion Scanner",
  description:
    "Multi-timeframe market scanning with structural analysis and precision entry execution.",
};

/**
 * Declared explicitly rather than left to the framework default so the two
 * phone-specific bits are locked in: `viewportFit: "cover"` lets the layout
 * paint into the notch/home-indicator areas (the `pb-safe` utility puts the
 * padding back where it matters), and `maximumScale: 5` keeps pinch-zoom
 * available — the price grids are dense, and disabling zoom would fail
 * WCAG 1.4.4.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
