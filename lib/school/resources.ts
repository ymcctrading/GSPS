/**
 * Published GSPS School resources — versioned code, same posture as the
 * curriculum itself. No file storage/CMS in this pass: each resource links
 * to an in-app destination (a lesson, an academy, or an external reference
 * already used elsewhere in GSPS) rather than a downloadable file.
 */
export interface SchoolResource {
  id: string;
  title: string;
  description: string;
  href: string;
  category: "reference" | "template" | "glossary";
}

export const SCHOOL_RESOURCES: readonly SchoolResource[] = [
  {
    id: "glossary",
    title: "GSPS Glossary",
    description: "Every trading/market term used across GSPS, in one reference.",
    href: "/glossary",
    category: "reference",
  },
  {
    id: "risk-constitution-template",
    title: "Risk Constitution Lab",
    description: "Draft your personal risk constitution: max risk per trade, max daily loss, pause conditions.",
    href: "/school/lesson/academy-3/preservation/risk-constitution-lab",
    category: "template",
  },
  {
    id: "playbook-template",
    title: "Trading Playbook Lab",
    description: "Write one complete, testable playbook entry.",
    href: "/school/lesson/academy-6/systems/playbook-lab",
    category: "template",
  },
  {
    id: "reversal-patterns",
    title: "Reversal & Continuation Pattern Reference",
    description: "The six bar-sequence reversal/continuation patterns GSPS detects, explained in plain language.",
    href: "/school/lesson/academy-4/structure/strat-fundamentals",
    category: "glossary",
  },
] as const;
