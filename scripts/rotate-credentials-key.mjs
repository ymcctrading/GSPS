#!/usr/bin/env node
// Re-encrypts every `broker_connections.credentials.enc` value from
// CREDENTIALS_ENCRYPTION_KEY_PREVIOUS to CREDENTIALS_ENCRYPTION_KEY.
//
// Rotation procedure (see SECURITY.md):
//   1. Generate a new key: `openssl rand -base64 32`.
//   2. In Vercel, move the current CREDENTIALS_ENCRYPTION_KEY value to
//      CREDENTIALS_ENCRYPTION_KEY_PREVIOUS, and set the new value as
//      CREDENTIALS_ENCRYPTION_KEY. Deploy — decrypt now accepts both keys,
//      so nothing breaks while this runs.
//   3. Run this script (needs SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY and both
//      CREDENTIALS_ENCRYPTION_KEY* vars in the environment):
//        node scripts/rotate-credentials-key.mjs
//   4. Once it reports zero rows still on the previous key, remove
//      CREDENTIALS_ENCRYPTION_KEY_PREVIOUS from Vercel and redeploy.

import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function keyFromEnv(name) {
  const buf = Buffer.from(requireEnv(name), "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes (base64)`);
  return buf;
}

function decrypt(payload, key) {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8"));
}

function encrypt(data, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const currentKey = keyFromEnv("CREDENTIALS_ENCRYPTION_KEY");
  const previousKey = keyFromEnv("CREDENTIALS_ENCRYPTION_KEY_PREVIOUS");

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: rows, error } = await supabase
    .from("broker_connections")
    .select("id, credentials");
  if (error) throw new Error(`Failed to list broker_connections: ${error.message}`);

  let migrated = 0;
  let alreadyCurrent = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const enc = row.credentials?.enc;
    if (typeof enc !== "string") continue;

    // Already on the new key — decrypting with it succeeds, nothing to do.
    try {
      decrypt(enc, currentKey);
      alreadyCurrent += 1;
      continue;
    } catch {
      // Falls through to the previous-key attempt below.
    }

    try {
      const plaintext = decrypt(enc, previousKey);
      const reencrypted = encrypt(plaintext, currentKey);
      const { error: updateError } = await supabase
        .from("broker_connections")
        .update({ credentials: { enc: reencrypted } })
        .eq("id", row.id);
      if (updateError) throw new Error(updateError.message);
      migrated += 1;
    } catch (err) {
      failed += 1;
      console.error(`Row ${row.id}: could not decrypt with either key — ${err.message}`);
    }
  }

  console.log(
    `Rotation complete. ${migrated} row(s) re-encrypted, ${alreadyCurrent} already on the current key, ${failed} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
