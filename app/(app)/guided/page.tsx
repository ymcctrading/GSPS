import { GuidedMode } from "@/components/guided/guided-mode";
import { MascotTip } from "@/components/onboarding/mascot-tip";

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
      {/*
        The tour's anchor sits here rather than inside GuidedMode, because
        GuidedMode returns early while loading, when the API errors, and when
        the mode is blocked — so an anchor in its success branch would exist
        only on the days a recommendation happens to render. What the tour is
        pointing at is "where the suggestion appears", which is this slot in
        every one of those states.
      */}
      {/* Above the slot, never over it — the tip explains the card, so covering
          the card would defeat it. */}
      <MascotTip id="first-guided-card" />
      <div data-tour="guided-card" className="min-w-0">
        <GuidedMode />
      </div>
    </div>
  );
}
