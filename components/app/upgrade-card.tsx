import { Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { minimumTierFor, TIER_META, type Feature } from "@/lib/tiers";

/** Server-rendered paywall shown in place of a feature the tier doesn't unlock. */
export function UpgradeCard({
  feature,
  title,
  blurb,
}: {
  feature: Feature;
  title: string;
  blurb: string;
}) {
  const required = minimumTierFor(feature);
  const meta = TIER_META[required];
  const price = meta.monthlyUsd ? `$${meta.monthlyUsd}/mo` : "";

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Lock className="h-7 w-7 text-accent" />
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="max-w-sm text-sm text-muted">{blurb}</p>
        <Button className="mt-1">
          Upgrade to {meta.label}
          {price ? ` — ${price}` : ""}
        </Button>
      </CardContent>
    </Card>
  );
}
