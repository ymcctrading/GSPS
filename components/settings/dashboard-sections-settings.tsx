"use client";

/**
 * Show, hide and reorder the Dashboard's sections (lib/dashboard/sections.ts).
 * Each change saves at once; a failed save puts the list back as it was.
 */

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/gann/switch";
import { fetchWithTimeout } from "@/lib/utils";
import {
  DASHBOARD_SECTIONS,
  DEFAULT_DASHBOARD_LAYOUT,
  moveDashboardSection,
  type DashboardLayout,
  type DashboardSectionId,
} from "@/lib/dashboard/sections";

const INFO = new Map(DASHBOARD_SECTIONS.map((s) => [s.id, s]));

export function DashboardSectionsSettings() {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/settings/dashboard")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !body?.layout) setError(body?.error ?? "Couldn't load your Dashboard layout.");
        else setLayout(body.layout as DashboardLayout);
      })
      .catch(() => !cancelled && setError("Couldn't load your Dashboard layout."));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: DashboardLayout) {
    if (!layout || saving) return;
    const before = layout;
    setLayout(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/settings/dashboard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.layout) throw new Error(body?.error ?? "Couldn't save your layout.");
      setLayout(body.layout as DashboardLayout);
    } catch (e) {
      setLayout(before);
      setError(e instanceof Error && e.name !== "AbortError" ? e.message : "Couldn't save your layout.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(id: DashboardSectionId) {
    if (!layout) return;
    const hidden = layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id];
    void save({ ...layout, hidden });
  }

  function move(id: DashboardSectionId, step: -1 | 1) {
    if (!layout) return;
    void save({ ...layout, order: moveDashboardSection(layout.order, id, step) });
  }

  const isDefault =
    layout != null &&
    layout.hidden.length === 0 &&
    layout.order.every((id, i) => id === DEFAULT_DASHBOARD_LAYOUT.order[i]);

  return (
    <Card id="dashboard-sections">
      <CardHeader>
        <CardTitle>Dashboard sections</CardTitle>
        <CardDescription>
          Choose which sections your Dashboard shows and in what order. Notices about your data and your
          rest days always show at the top.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <p className="text-sm text-bear">{error}</p>}
        {!layout ? (
          !error && <p className="text-sm text-muted">Loading…</p>
        ) : (
          <>
            <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {layout.order.map((id, i) => {
                const info = INFO.get(id);
                const shown = !layout.hidden.includes(id);
                return (
                  <li key={id} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        aria-label={`Move ${info?.label ?? id} up`}
                        disabled={saving || i === 0}
                        onClick={() => move(id, -1)}
                        className="rounded p-0.5 text-muted hover:text-accent disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${info?.label ?? id} down`}
                        disabled={saving || i === layout.order.length - 1}
                        onClick={() => move(id, 1)}
                        className="rounded p-0.5 text-muted hover:text-accent disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={shown ? "text-sm font-medium" : "text-sm font-medium text-muted line-through"}>
                        {info?.label ?? id}
                      </p>
                      {info?.note && <p className="text-xs text-muted">{info.note}</p>}
                    </div>
                    <Switch
                      label={`Show ${info?.label ?? id}`}
                      checked={shown}
                      onChange={() => !saving && toggle(id)}
                    />
                  </li>
                );
              })}
            </ol>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={saving || isDefault}
              onClick={() => void save(DEFAULT_DASHBOARD_LAYOUT)}
            >
              Restore the default layout
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
