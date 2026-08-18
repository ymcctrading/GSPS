import { GuidedMode } from "@/components/guided/guided-mode";

export const metadata = { title: "Guided — GSPS" };
export const dynamic = "force-dynamic";

export default function GuidedPage() {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">Guided</h1>
        <p className="text-sm text-muted">
          One recommended trade at a time, sized for your paper account. Every order still needs
          your confirmation — nothing here trades on its own.
        </p>
      </div>
      <GuidedMode />
    </div>
  );
}
