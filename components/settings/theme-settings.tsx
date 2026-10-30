"use client";

import { useSyncExternalStore } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  applyTheme,
  forgetPageThemeChoice,
  readThemeChoice,
  resolveTheme,
  saveThemeChoice,
  THEME_CHOICES,
  type ThemeChoice,
} from "@/lib/theme";

const LABEL: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", device: "Match device" };

// The stored choice as an external store: this tab's clicks and other tabs'
// storage events both re-read it. The server has no choice to show.
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  const onStorage = () => {
    forgetPageThemeChoice();
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Light, dark or the device's own setting, kept on this device (`lib/theme.ts`). */
export function ThemeSettings() {
  const choice = useSyncExternalStore<ThemeChoice | null>(subscribe, readThemeChoice, () => null);

  function choose(next: ThemeChoice) {
    saveThemeChoice(next);
    listeners.forEach((l) => l());
    applyTheme(resolveTheme(next, window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Kept on this device, so your phone and your computer can differ.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-border p-0.5">
          {THEME_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={choice === c}
              onClick={() => choose(c)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                choice === c ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {LABEL[c]}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
