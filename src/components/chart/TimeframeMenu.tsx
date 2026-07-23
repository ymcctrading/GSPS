"use client";

import { TIMEFRAMES } from "@/config/timeframes";

/**
 * The interval picker, mirroring the app's scrolling menu: regular intervals
 * first, then the "Extended" (ETH) variants. Selecting one closes the menu.
 */
export function TimeframeMenu({
  activeId,
  onPick,
  onClose,
}: {
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const regular = TIMEFRAMES.filter((t) => !t.extended);
  const extended = TIMEFRAMES.filter((t) => t.extended);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-9 z-50 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-[#2a2f3a] bg-[#15181f] py-1 shadow-2xl">
        {regular.map((t) => (
          <MenuRow
            key={t.id}
            label={t.menuLabel}
            active={t.id === activeId}
            onClick={() => onPick(t.id)}
          />
        ))}
        <div className="my-1 border-t border-[#2a2f3a]" />
        <p className="px-4 py-1 text-[10px] uppercase tracking-wide text-[#6b7280]">
          Extended hours
        </p>
        {extended.map((t) => (
          <MenuRow
            key={t.id}
            label={t.menuLabel}
            active={t.id === activeId}
            onClick={() => onPick(t.id)}
          />
        ))}
      </div>
    </>
  );
}

function MenuRow({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full px-4 py-2 text-left text-sm ${
        active ? "bg-accent/15 text-accent" : "text-[#d3d7de] hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}
