"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  installState,
  isStandalone,
  type InstallState,
} from "@/lib/pwa/install";
import {
  heldInstallPrompt,
  holdInstallPrompt,
  onInstallPromptChange,
} from "@/lib/pwa/installPrompt";

/**
 * Install GSPS (Q3 item 1, `docs/Q3_PLAN.md`): how to add it to this
 * device's home screen, read by `lib/pwa/install.ts`. On iPhone it is the step
 * that makes push possible at all, so the card sits beside the push switch.
 */
export function InstallAppCard() {
  const [state, setState] = useState<InstallState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Once installed in this visit the tab is still not standalone, so a re-read
  // would show the install steps again; this keeps the answer.
  const installedRef = useRef(false);

  useEffect(() => {
    const read = () =>
      setState(
        installedRef.current
          ? { kind: "installed" }
          : installState({
              userAgent: navigator.userAgent,
              maxTouchPoints: navigator.maxTouchPoints ?? 0,
              standalone: isStandalone(),
              promptAvailable: heldInstallPrompt() != null,
            }),
      );
    read();
    const unsubscribe = onInstallPromptChange(read);
    const installed = () => {
      installedRef.current = true;
      holdInstallPrompt(null);
      setState({ kind: "installed" });
    };
    window.addEventListener("appinstalled", installed);
    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  async function install() {
    const event = heldInstallPrompt();
    if (!event) return;
    // A prompt can be shown once: let go of it first, so a second tap finds
    // none (the button goes) instead of calling it again.
    holdInstallPrompt(null);
    setMessage(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        installedRef.current = true;
        setState({ kind: "installed" });
      } else {
        setMessage(
          "Not installed. You can install GSPS from your browser's menu at any time.",
        );
      }
    } catch {
      setMessage(
        "Your browser didn't show its install prompt. Use its menu's Install or Add to Home Screen.",
      );
    }
  }

  if (state == null) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>Install GSPS</span>
        <Badge variant={state.kind === "installed" ? "bull" : "muted"}>
          {state.kind === "installed" ? "Installed" : "In the browser"}
        </Badge>
      </div>
      {state.kind === "installed" && (
        <p className="text-xs text-muted">
          GSPS is installed on this device. Turn on alerts for it below.
        </p>
      )}
      {state.kind === "ios_steps" && (
        <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted">
          <li>
            Tap Share (in Safari&apos;s toolbar, or Chrome&apos;s address bar).
          </li>
          <li>Tap Add to Home Screen, then Add.</li>
          <li>
            Open GSPS from your Home Screen and turn on alerts here. iPhone
            sends alerts only to the Home Screen app.
          </li>
        </ol>
      )}
      {state.kind === "prompt" && (
        <Button type="button" size="sm" variant="outline" onClick={install}>
          Install GSPS
        </Button>
      )}
      {state.kind === "browser_menu" && (
        <p className="text-xs text-muted">
          Use your browser&apos;s menu: Install, or Add to Home Screen. Some
          browsers don&apos;t offer it.
        </p>
      )}
      {message && <p className="text-xs text-muted">{message}</p>}
    </div>
  );
}
