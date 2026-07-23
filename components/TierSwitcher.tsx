"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const TIERS = [
  { key: "PRACTICE", label: "Practice" },
  { key: "STANDARD", label: "Standard" },
  { key: "INVESTOR_MODE", label: "Investor Mode" },
  { key: "SYSTEM_MASTERY", label: "System Mastery" },
];

/**
 * Owner preview control: switch which tier the UI renders as, to see paywalls.
 * Writes the gsps_view_tier cookie and refreshes. Owner access is always full;
 * this only changes the preview.
 */
export function TierSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);

  function change(next: string) {
    setValue(next);
    document.cookie = `gsps_view_tier=${next}; path=/; max-age=31536000`;
    router.refresh();
  }

  return (
    <label className="flex items-center gap-1 text-xs text-slate-400">
      View as
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-slate-600"
      >
        {TIERS.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default TierSwitcher;
