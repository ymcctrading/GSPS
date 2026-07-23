"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TierSwitcher } from "@/components/TierSwitcher";

const TABS = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/scanner", label: "Scanner", icon: "◎" },
  { href: "/portfolio", label: "Portfolio", icon: "▤" },
  { href: "/automation", label: "Automation", icon: "🤖" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav({ viewerTier }: { viewerTier: string }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="text-brand-blue">📈</span> GSPS
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {TABS.map((t) => {
            const active = pathname?.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                  active
                    ? "bg-blue-50 text-brand-blue"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <span aria-hidden className="text-xs">
                  {t.icon}
                </span>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <TierSwitcher current={viewerTier} />
        </div>
      </div>
    </header>
  );
}
