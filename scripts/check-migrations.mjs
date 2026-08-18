#!/usr/bin/env node
// Guards against the failure mode in CHANGELOG.md: two migrations sharing a
// numeric prefix, so apply order depends on how the file lister happens to
// sort ties (which one wins is coincidence, not intent), and a hand-applied
// rollout can silently skip one. Fails CI if any prefix collides or a
// filename doesn't match the `000N_description.sql` convention documented
// in supabase/AGENTS.md.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationsDir = fileURLToPath(
  new URL("../supabase/migrations", import.meta.url),
);

const NAME_PATTERN = /^(\d{4,})_[a-z0-9_]+\.sql$/;

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

let ok = true;
const byPrefix = new Map();

for (const file of files) {
  const match = file.match(NAME_PATTERN);
  if (!match) {
    console.error(
      `✗ ${file}: doesn't match 000N_description.sql (see supabase/AGENTS.md)`,
    );
    ok = false;
    continue;
  }
  const [, prefix] = match;
  const existing = byPrefix.get(prefix);
  if (existing) {
    console.error(`✗ ${prefix}: duplicate prefix — ${existing} and ${file}`);
    ok = false;
  } else {
    byPrefix.set(prefix, file);
  }
}

if (ok) {
  console.log(`✓ ${files.length} migrations, all prefixes unique`);
  process.exit(0);
} else {
  console.error(
    "\nEach migration must have a unique numeric prefix so apply order is unambiguous.",
  );
  process.exit(1);
}
