import { SchoolFlow } from "@/components/school/school-flow";

export const metadata = { title: "GSPS School — GSPS" };

export default function SchoolPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">GSPS School</h1>
        <p className="text-sm text-muted">
          Live-Trading Risk Re-Certification — required after a 50% live-loss restriction, open to any member.
        </p>
      </div>
      <SchoolFlow />
    </div>
  );
}
