#!/usr/bin/env node
/**
 * Re-read the Federal Reserve's FOMC meeting calendar and print the entries
 * for `lib/macro/fomc.ts` (FOMC_MEETINGS). Prints only; review the output and
 * paste it in by hand, then move FOMC_READ_ON.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/fetch-fomc-calendar.mjs   (behind the session proxy)
 *   node scripts/fetch-fomc-calendar.mjs                        (elsewhere)
 */

const URL = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const res = await fetch(URL);
if (!res.ok) {
  console.error(`The Fed's calendar answered ${res.status}.`);
  process.exit(1);
}
const html = await res.text();
const update = html.replace(/<[^>]+>/g, " ").match(/Last Update:\s+([A-Z][a-z]+ \d{1,2}, \d{4})/)?.[1] ?? "not found";
console.log(`// Read ${new Date().toISOString().slice(0, 10)}; the page says "Last Update: ${update}".`);

const years = [...html.matchAll(/(\d{4}) FOMC Meetings/g)].map((x) => ({ year: Number(x[1]), at: x.index }));
for (let i = 0; i < years.length; i++) {
  const { year, at } = years[i];
  if (year < new Date().getUTCFullYear()) continue;
  const segment = html.slice(at, years[i + 1]?.at ?? html.length);
  const months = [...segment.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>/g)].map((x) => x[1].trim());
  const dates = [...segment.matchAll(/fomc-meeting__date[^>]*>([^<]+)</g)].map((x) => x[1].trim());
  months.forEach((month, k) => {
    const raw = dates[k] ?? "";
    if (/notation|unscheduled/i.test(raw)) return;
    const projections = raw.includes("*");
    const parts = month.split("/");
    const [d1, d2] = raw.replace("*", "").split("-").map((n) => n.trim().padStart(2, "0"));
    const m1 = String(MONTHS.indexOf(parts[0]) + 1).padStart(2, "0");
    const m2 = String(MONTHS.indexOf(parts[parts.length - 1]) + 1).padStart(2, "0");
    if (!d1 || !d2 || m1 === "00") {
      console.log(`// could not read: ${month} ${raw}`);
      return;
    }
    console.log(`  m("${year}-${m1}-${d1}", "${year}-${m2}-${d2}"${projections ? ", true" : ""}),`);
  });
}
