"use client";

import { createContext, useContext } from "react";
import { termLabel, type TermId, type VocabularyTier } from "@/lib/school/terms";

/**
 * The reader's tier for trading vocabulary (lib/school/terms.ts), set once in
 * the app shell from `profiles.tier`. Without a provider, or for a visitor,
 * the tier is null and every term reads as introduced ("Entry (buy stop)").
 */
const VocabularyContext = createContext<VocabularyTier>(null);

export function VocabularyProvider({ tier, children }: { tier: VocabularyTier; children: React.ReactNode }) {
  return <VocabularyContext.Provider value={tier}>{children}</VocabularyContext.Provider>;
}

/** The reader's tier, for a surface that builds its own sentence. */
export function useVocabularyTier(): VocabularyTier {
  return useContext(VocabularyContext);
}

/** One term in the reader's words, for a label passed as a string. */
export function useTerm(id: TermId): string {
  return termLabel(id, useContext(VocabularyContext));
}

/** One term in the reader's words, for use inside markup (server or client). */
export function Term({ id }: { id: TermId }) {
  return <>{useTerm(id)}</>;
}

/** Every term in the reader's words, for a component with several labels. */
export function useTerms(): (id: TermId) => string {
  const tier = useContext(VocabularyContext);
  return (id) => termLabel(id, tier);
}
