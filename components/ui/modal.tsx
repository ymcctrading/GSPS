"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Modal — the shared popup shell for every interactive overlay in the app
 * (strike purchase ticket, chart trade widget, position close confirmation).
 *
 * Transitions run off a mounted/visible pair rather than a library: the element
 * mounts first, then a frame later flips the `visible` class, so the browser has
 * a start state to animate from. On close the element stays mounted for the
 * duration of the exit transition and unmounts after.
 */

const EXIT_MS = 180;

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  // Portals need a DOM target, which only exists once the client has taken
  // over — useSyncExternalStore is the sanctioned way to read that (false on
  // the server and on the client's first pass, true right after), so mounting
  // doesn't need its own effect.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [present, setPresent] = React.useState(open);
  const [visible, setVisible] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      // Mounting the panel and starting its enter transition are genuinely two
      // ticks apart (the transition needs a committed start state to animate
      // from), which an effect is the correct tool for — this one line is the
      // synchronous half of that handshake.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresent(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setPresent(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Escape to close, and keep the page behind from scrolling underneath.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  // Move focus into the panel so keyboard users land inside the dialog.
  React.useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none",
          visible ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-2xl outline-none",
          "transition-all duration-200 ease-out motion-reduce:transition-none sm:max-w-lg sm:rounded-2xl",
          visible ? "translate-y-0 opacity-100 sm:scale-100" : "translate-y-4 opacity-0 sm:translate-y-0 sm:scale-95",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {/* pb-safe clears the iOS home indicator, which sits over the footer
            while the panel is docked to the bottom of a phone screen. */}
        {footer && <div className="pb-safe-4 border-t border-border px-5 pt-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
