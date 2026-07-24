"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/** Copies the public /chart/<symbol> link so a chart can be shared without login. */
export function ShareButton({ symbol }: { symbol: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/chart/${encodeURIComponent(symbol.toUpperCase())}`
        : `/chart/${symbol}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${symbol.toUpperCase()} — GSPS`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Share/clipboard denied — fall back to a prompt so the link is still grabbable.
      window.prompt("Public chart link:", url);
    }
  }

  return (
    <button
      onClick={share}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground cursor-pointer"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-bull" /> Copied
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" /> Share
        </>
      )}
    </button>
  );
}
