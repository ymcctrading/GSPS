"use client";

/**
 * The chart's indicator periods and saved presets (SYNTHESIZED_ROADMAP Q2 item
 * 6). A panel under the indicator chips: edit the periods of the indicators
 * that are on, save the chart's indicators and periods as a named preset, and
 * load or delete one. Display only; see lib/chart/indicatorParams.ts for the
 * line this keeps and its design basis.
 */

import { useState } from "react";
import {
  DEFAULT_INDICATOR_PARAMS,
  IndicatorParamsSchema,
  MAX_PRESETS,
  PARAM_FIELDS,
  PRESET_NAME_MAX,
  indicatorLabel,
  type ChartOverlay,
  type ChartPreset,
  type ChartStudy,
  type IndicatorParams,
  type ParamIndicator,
} from "@/lib/chart/indicatorParams";

export function IndicatorSettings({
  params,
  presets,
  overlays,
  studies,
  techniqueKeys,
  techniqueName,
  saving,
  message,
  canSave,
  onChangeParams,
  onSavePreset,
  onDeletePreset,
  onLoadPreset,
}: {
  params: IndicatorParams;
  presets: ChartPreset[];
  overlays: ReadonlySet<ChartOverlay>;
  studies: ReadonlySet<ChartStudy>;
  /** Indicators a chosen technique switched on: drawn on its own periods, not editable here. */
  techniqueKeys: ReadonlySet<ParamIndicator>;
  techniqueName: string | null;
  saving: boolean;
  message: string | null;
  /** False when signed out: periods still apply to this chart, nothing is saved. */
  canSave: boolean;
  onChangeParams: (next: IndicatorParams) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (name: string) => void;
  onLoadPreset: (preset: ChartPreset) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [presetName, setPresetName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const on = [...overlays, ...studies].filter((k): k is ParamIndicator => k in PARAM_FIELDS);

  const valueOf = (key: ParamIndicator, field: string) =>
    draft[`${key}.${field}`] ?? String((params[key] as Record<string, number>)[field]);

  // Checked here as the server checks it, so an empty, out-of-range or
  // inverted value is never drawn: the field goes back to the value in force.
  const commit = (key: ParamIndicator, field: string, raw: string) => {
    setDraft((d) => {
      const next = { ...d };
      delete next[`${key}.${field}`];
      return next;
    });
    const current = (params[key] as Record<string, number>)[field];
    const n = raw.trim() === "" ? Number.NaN : Number(raw);
    if (n === current) return;
    const candidate = { ...params[key], [field]: n };
    const ok =
      IndicatorParamsSchema.shape[key].safeParse(candidate).success &&
      !(key === "macd" && (candidate as IndicatorParams["macd"]).fast >= (candidate as IndicatorParams["macd"]).slow);
    if (!ok) {
      setFieldError(
        key === "macd"
          ? "MACD needs whole numbers, with the fast period shorter than the slow one. The value in force was kept."
          : "That value is out of range for this indicator. The value in force was kept.",
      );
      return;
    }
    setFieldError(null);
    onChangeParams({ ...params, [key]: candidate } as IndicatorParams);
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-xs">
      {on.length === 0 ? (
        <p className="text-muted">Switch an indicator on to set its periods.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {on.map((key) => {
            const locked = techniqueKeys.has(key);
            return (
              <fieldset key={key} className="space-y-1">
                <legend className="font-medium">
                  {indicatorLabel(key, locked ? { ...params, [key]: DEFAULT_INDICATOR_PARAMS[key] } : params)}
                </legend>
                {locked ? (
                  <p className="text-muted">
                    Drawn on {techniqueName ?? "the chosen technique"}&apos;s own periods while it explains the plan.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    {PARAM_FIELDS[key].map(({ field, label, step }) => (
                      <label key={field} className="flex flex-col gap-0.5 text-muted">
                        {label}
                        <input
                          type="number"
                          inputMode="decimal"
                          step={step}
                          className="w-20 rounded-md border bg-background px-2 py-1 text-foreground"
                          value={valueOf(key, field)}
                          onChange={(e) => setDraft((d) => ({ ...d, [`${key}.${field}`]: e.target.value }))}
                          onBlur={(e) => commit(key, field, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      className="rounded-md border px-2 py-1 text-muted hover:text-foreground"
                      onClick={() => onChangeParams({ ...params, [key]: DEFAULT_INDICATOR_PARAMS[key] } as IndicatorParams)}
                    >
                      Reset
                    </button>
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-2">
        {fieldError && (
          <p role="alert" className="text-muted">
            {fieldError}
          </p>
        )}
        <p className="font-medium">Presets</p>
        {presets.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <li key={p.name} className="flex items-center rounded-md border">
                <button type="button" className="px-2 py-1 hover:text-accent" onClick={() => onLoadPreset(p)}>
                  {p.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete preset ${p.name}`}
                  className="border-l px-1.5 py-1 text-muted hover:text-foreground"
                  onClick={() => onDeletePreset(p.name)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {canSave ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = presetName.trim();
            if (!name) return;
            onSavePreset(name);
            setPresetName("");
          }}
        >
          <input
            type="text"
            aria-label="Preset name"
            maxLength={PRESET_NAME_MAX}
            placeholder="Preset name"
            className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button
            type="submit"
            disabled={saving || !presetName.trim()}
            className="rounded-md border border-accent px-2 py-1 font-medium text-accent disabled:opacity-50"
          >
            Save current
          </button>
        </form>
        ) : (
          <p className="text-muted">Sign in to save your periods and presets. Changes here last until you leave the page.</p>
        )}
        {canSave && (
          <p className="text-muted">
            A preset keeps the indicators that are on and their periods, up to {MAX_PRESETS}. Saving under an existing
            name replaces it.
          </p>
        )}
        <p aria-live="polite" className="text-muted">
          {message}
        </p>
      </div>
    </div>
  );
}
