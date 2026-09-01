import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

/** School → Academy → Course → Module → Lesson, per the lesson-player spec. */
export function SchoolBreadcrumbs({ trail }: { trail: readonly Crumb[] }) {
  const crumbs: Crumb[] = [{ label: "School", href: "/school" }, ...trail];
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-muted">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-foreground hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
