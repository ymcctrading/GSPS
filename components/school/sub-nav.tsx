"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const SUB_NAV_LINKS = [
  { href: "/school", label: "Curriculum" },
  { href: "/school/progress", label: "Progress & gate status" },
  { href: "/school/labs", label: "Labs" },
  { href: "/school/resources", label: "Resources" },
] as const;

/**
 * Cross-links to the other top-level School pages, rendered at the bottom of
 * every School page so a learner can move between Curriculum/Progress/Labs/
 * Resources directly instead of going back through the dashboard each time.
 */
export function SchoolSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="School sections" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
      {SUB_NAV_LINKS.map(({ href, label }) => {
        const active = href === "/school" ? pathname === "/school" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("text-accent hover:underline", active && "font-medium underline")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
