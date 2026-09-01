import { SchoolFlow } from "@/components/school/school-flow";

export const metadata = { title: "Live-Trading Re-Certification — GSPS School" };

/**
 * The original pilot, unchanged, moved from /school (now the curriculum
 * dashboard) to its own route. This is "Course W2" inside Academy 8 in the
 * curriculum map, but stays reachable directly since a restricted account
 * needs it regardless of curriculum progress.
 */
export default function RecertificationPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Live-Trading Risk Re-Certification</h1>
        <p className="text-sm text-muted">
          Required after a 50% live-loss restriction, open to any member. Part of GSPS School&apos;s Wall Street academy as Course W2.
        </p>
      </div>
      <SchoolFlow />
    </div>
  );
}
