export function usd(n: number | null | undefined, opts?: { dash?: boolean }): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) {
    return opts?.dash ? "—" : "$0.00";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n));
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "0.00%";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** Execute / Watch / Reject → badge colors matching the current app. */
export function outputStateColor(state: string): string {
  switch (state) {
    case "Execute":
      return "bg-green-100 text-green-700 border-green-200";
    case "Watch":
      return "bg-amber-100 text-amber-700 border-amber-200";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}
