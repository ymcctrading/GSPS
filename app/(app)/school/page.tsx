import { CurriculumDashboard } from "@/components/school/curriculum-dashboard";

export const metadata = { title: "GSPS School — GSPS" };

export default function SchoolPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">GSPS School</h1>
        <p className="text-sm text-muted">
          Evidence-based trading education built on Signal + Bull Case + Bear Challenge → Risk-Defined Operator Decision.
        </p>
      </div>
      <CurriculumDashboard />
    </div>
  );
}
