"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Radar, Briefcase, Bot, FlaskConical, BookOpen, Settings, LogOut, TrendingUp, Compass, UserCircle } from "lucide-react";
import { SymbolSearch } from "@/components/search/symbol-search";

/**
 * Every destination, in order. `tabBar: false` keeps one out of the phone tab
 * bar without removing it from the app — see the ceiling explained on `AppNav`.
 */
const LINKS = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: LayoutDashboard, tabBar: true },
  { href: "/guided", label: "Guided", short: "Guided", icon: Compass, tabBar: true },
  { href: "/scanner", label: "Scanner", short: "Scan", icon: Radar, tabBar: true },
  { href: "/portfolio", label: "Portfolio", short: "Book", icon: Briefcase, tabBar: true },
  { href: "/automation", label: "Automation", short: "Auto", icon: Bot, tabBar: true },
  { href: "/learning", label: "Backtest", short: "Test", icon: FlaskConical, tabBar: true },
  // Reference material rather than a destination you navigate to on purpose,
  // and it is linked from the copy that uses its terms — so it is the one that
  // gives up its tab-bar slot to Guided, which is the novice's primary path.
  { href: "/glossary", label: "Glossary", short: "Terms", icon: BookOpen, tabBar: false },
  { href: "/settings", label: "Settings", short: "Setup", icon: Settings, tabBar: true },
];

/**
 * The `data-tour` value for a destination, derived from its href rather than
 * listed separately so the two can never drift apart. Both the top bar and the
 * tab bar carry it: exactly one of them is visible at any breakpoint, and the
 * tour picks whichever one actually has a size — see `resolveAnchor` in
 * `components/onboarding/tour-overlay.tsx`.
 *
 * This attribute exists only for the tour. It is not a styling hook and nothing
 * else should read it, which is the point: a class or an id used for both would
 * be renamed during a restyle and take the tour's anchors with it, silently.
 */
function tourAnchor(href: string): string {
  return `nav-${href.replace(/^\//, "")}`;
}

const TAB_BAR_LINKS = LINKS.filter((l) => l.tabBar);

/**
 * Navigation, calibrated per device class.
 *
 * Phones (< md) get a compact top bar for identity plus a fixed bottom tab bar
 * for the destinations: seven icon targets crammed into a 14px-tall header left
 * no room for labels and put the whole nav out of thumb reach. Tablets and up
 * keep the single top bar, gaining labels at md and more breathing room at xl.
 *
 * Seven is the ceiling for the tab bar. On the narrowest supported screen each
 * tab is ~51px wide, still clear of the 44px minimum target; an eighth
 * destination would cross it and needs a different shape, not another tab. So
 * the tab bar renders the seven marked `tabBar` and the top bar renders all
 * eight — adding a destination means deciding which one leaves the tab bar, not
 * quietly shrinking every target.
 */
export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => pathname.startsWith(href);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-3 sm:px-4 lg:gap-6 lg:px-6 2xl:max-w-7xl">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-semibold">
            <TrendingUp className="h-5 w-5 text-accent" />
            GSPS
          </Link>

          {/* Tablet and up: inline destinations. Phones use the tab bar below. */}
          <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
            {LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                data-tour={tourAnchor(href)}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground lg:px-3",
                  isActive(href) && "bg-accent-soft text-accent hover:text-accent",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <SymbolSearch />

            <Link
              href="/settings"
              aria-label="Account settings"
              aria-current={isActive("/settings") ? "page" : undefined}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent transition-colors hover:opacity-80",
                isActive("/settings") && "ring-2 ring-accent",
              )}
            >
              <UserCircle className="h-5 w-5" />
            </Link>

            <button
              onClick={signOut}
              className="flex min-h-11 shrink-0 items-center gap-1.5 text-sm text-muted hover:text-foreground cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">Sign out</span>
              <span className="sr-only lg:hidden">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Phones: thumb-reachable tab bar pinned above the home indicator. */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="flex items-stretch justify-around">
          {TAB_BAR_LINKS.map(({ href, short, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              data-tour={tourAnchor(href)}
              aria-label={label}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
                isActive(href) ? "text-accent" : "text-muted",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="truncate">{short}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
