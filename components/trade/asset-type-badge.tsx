import { Badge } from "@/components/ui/badge";

/**
 * SHARES / OPT tag for a ledger row's `asset_type` — the strict EQUITY/OPTION
 * flag stored on `orders`/`positions` (see migration 0004). Kept as its own
 * component so every place a row needs to identify its asset type (order
 * history, open positions) renders the same label/colour.
 */
export function AssetTypeBadge({ assetType }: { assetType: "EQUITY" | "OPTION" }) {
  return (
    <Badge variant={assetType === "OPTION" ? "default" : "muted"}>
      {assetType === "OPTION" ? "OPT" : "SHARES"}
    </Badge>
  );
}
