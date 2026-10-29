import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeWatcher } from "@/components/app/theme-watcher";
import { THEME_SCRIPT } from "@/lib/theme";

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
  // Opened from an iPhone's Home Screen, GSPS runs as its own app (app/manifest.ts).
  appleWebApp: { capable: true, title: "GSPS", statusBarStyle: "default" },
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
  // The dark palette is class-based (`.dark`), chosen per device in Settings
  // (`lib/theme.ts`), not by `prefers-color-scheme`, so this is the light
  // default and the head script rewrites it to the chosen theme's colour
  // before paint. Splitting it by media query would tint the browser bar dark
  // on a dark-mode phone whose member kept the light theme.
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The head script sets `.dark` before React hydrates, so the html element's
    // class can differ from the server's; that one difference is expected.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeWatcher />
        {children}
      </body>
    </html>
  );
}
