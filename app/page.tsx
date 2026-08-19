import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TrendingUp, Radar, Target, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "GSPS — Guided Stock Projection System",
  description:
    "GSPS helps traders see the setup, plan the trade, and manage risk before entering a position. Multi-timeframe scanning, clear entries, defined stops, and setups scored out of 9.",
};

const FEATURES = [
  {
    icon: Radar,
    title: "Top-down scanning",
    body: "Ten years down to fifteen minutes. The scanner reads macro trend and support, then narrows to triggered entries on the execution timeframe.",
  },
  {
    icon: Target,
    title: "Pinpoint levels",
    body: "Every setup ships with an entry, a structural stop, a 1.5R first target, and a final target stepped out to the nearest structural level — mapped before the candle opens, never in hindsight.",
  },
  {
    icon: ShieldCheck,
    title: "Scored out of 9",
    body: "Nine confluence checks across structural analysis, reversal patterns, and risk quality. Seven or higher with a priced trade plan signals Execute; below four, the setup is rejected.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-5 w-5 text-accent" /> GSPS
          </span>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            See the setup. <span className="text-accent">Plan the trade.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            GSPS is a guided trade-planning system that turns market movement into
            clear, risk-defined trade scenarios — objective entries, defined stops,
            and a daily list of the market&apos;s thirty most promising setups.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup">
              <Button size="lg">Start scanning</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">I have an account</Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            No account needed —{" "}
            <Link href="/chart/SPY" className="font-medium text-accent hover:underline">
              open a live shareable chart
            </Link>
            .
          </p>
        </section>

        <section className="mx-auto grid max-w-5xl gap-6 px-4 pb-24 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-6">
              <Icon className="h-6 w-6 text-accent" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        GSPS provides market analysis, not financial advice. Trading involves risk of loss.
      </footer>
    </div>
  );
}
