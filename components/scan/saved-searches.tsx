"use client";

import { useEffect, useState } from "react";
import { Bookmark, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ScanCriteriaPreset {
  id: string;
  name: string;
  sector_keys: string[];
  custom_symbols: string;
  created_at: string;
}

/**
 * Save the current Universe-tab search (selected industries + custom
 * symbols) under a name, and reload/re-run a previously saved one.
 * BACKLOG.md's "Saved scan criteria/watchlists" item — distinct from the
 * scan-result history tab and from bare-symbol watchlists.
 */
export function SavedSearches({
  selected,
  custom,
  onLoad,
}: {
  selected: string[];
  custom: string;
  onLoad: (preset: { sectorKeys: string[]; customSymbols: string }) => void;
}) {
  const [presets, setPresets] = useState<ScanCriteriaPreset[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/scan-criteria");
      if (!res.ok) return;
      const data = await res.json();
      setPresets(data.presets ?? []);
    } catch {
      // Signed-out or transient error — leave the list empty rather than blocking the scanner.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveCurrent() {
    const name = window.prompt("Name this search");
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/scan-criteria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sectorKeys: selected, customSymbols: custom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save search");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setPresets((prev) => prev?.filter((p) => p.id !== id) ?? null);
    await fetch(`/api/scan-criteria/${id}`, { method: "DELETE" });
  }

  const hasCriteria = selected.length > 0 || custom.trim() !== "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Saved searches</span>
        <button
          onClick={saveCurrent}
          disabled={!hasCriteria || saving}
          className={cn(
            "flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline",
          )}
        >
          <Bookmark className="h-3 w-3" />
          {saving ? "Saving…" : "Save this search"}
        </button>
      </div>
      {error && <p className="text-xs text-bear">{error}</p>}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs"
            >
              <button
                onClick={() =>
                  onLoad({ sectorKeys: preset.sector_keys, customSymbols: preset.custom_symbols })
                }
                className="font-medium text-foreground hover:text-accent"
                title="Load this search"
              >
                {preset.name}
              </button>
              <button
                onClick={() => remove(preset.id)}
                className="text-muted hover:text-bear"
                title="Delete this saved search"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
