import { cookies } from "next/headers";
import {
  hasFeature,
  type Feature,
  type PlatformTier,
  TIER_ORDER,
} from "@/engine/tiers/entitlements";

export const VIEW_TIER_COOKIE = "gsps_view_tier";

/**
 * The tier the current viewer is treated as. Owner access defaults to
 * SYSTEM_MASTERY (full access). A "view as" cookie lets the owner preview how
 * each tier's paywall looks without signing out — real access stays full.
 */
export function getViewerTier(): PlatformTier {
  const raw = cookies().get(VIEW_TIER_COOKIE)?.value as PlatformTier | undefined;
  if (raw && TIER_ORDER.includes(raw)) return raw;
  return "SYSTEM_MASTERY";
}

export function viewerHas(feature: Feature): boolean {
  return hasFeature(getViewerTier(), feature);
}
