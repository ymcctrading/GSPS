import { Badge } from "@/components/ui/badge";

export type Provenance = "measured" | "learner_reported" | "planned";

const LABEL: Record<Provenance, string> = {
  measured: "Measured",
  learner_reported: "Learner-reported",
  planned: "Planned",
};

const VARIANT: Record<Provenance, "bull" | "warn" | "muted"> = {
  measured: "bull",
  learner_reported: "warn",
  planned: "muted",
};

/** Every metric shown in School must carry one of these labels — see product spec section 13. Never render a Planned metric without this badge. */
export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return <Badge variant={VARIANT[provenance]}>{LABEL[provenance]}</Badge>;
}
