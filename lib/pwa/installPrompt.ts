/**
 * The browser's install prompt, held from the moment it fires. Chrome fires
 * `beforeinstallprompt` once, early, usually before the member reaches
 * Settings, so the signed-in shell's registrar catches it and the Settings
 * card's Install button reads it here (Q3 item 1).
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let held: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function holdInstallPrompt(event: InstallPromptEvent | null): void {
  held = event;
  listeners.forEach((l) => l());
}

export function heldInstallPrompt(): InstallPromptEvent | null {
  return held;
}

/** Calls `listener` whenever the held prompt changes; returns the unsubscribe. */
export function onInstallPromptChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
