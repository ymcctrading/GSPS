/**
 * AES-256-GCM encryption for broker credentials at rest.
 * CREDENTIALS_ENCRYPTION_KEY is a 32-byte base64 string.
 *
 * CREDENTIALS_ENCRYPTION_KEY_PREVIOUS (optional, same format) lets a key
 * rotation happen without invalidating every already-encrypted row: decrypt
 * tries the current key first, falls back to the previous one, while encrypt
 * always writes under the current key. Run `scripts/rotate-credentials-key.mjs`
 * after rotating to re-encrypt every row under the new key, then drop
 * CREDENTIALS_ENCRYPTION_KEY_PREVIOUS. See SECURITY.md.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

function loadKey(envVar: string, required: true): Buffer;
function loadKey(envVar: string, required: false): Buffer | null;
function loadKey(envVar: string, required: boolean): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) {
    if (required) throw new Error(`${envVar} is not configured`);
    return null;
  }
  return keyFromSecret(raw);
}

/** Salt for a passphrase-style key: fixed, so the same secret always gives the same key. */
const PASSPHRASE_SALT = "gsps-credentials-key-v1";
const derived = new Map<string, Buffer>();

/**
 * The 32-byte key a secret stands for. A secret that is 32 bytes of base64
 * (`openssl rand -base64 32`) is the key itself, as before. Any other value
 * of at least 16 characters is treated as a passphrase and stretched with
 * scrypt (owner, 2026-11-12: the secret he set was not base64, and the
 * console steps to make one were not something he could follow). Shorter
 * values are refused. `scripts/rotate-credentials-key.mjs` derives the same.
 */
export function keyFromSecret(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 32) return buf;
  }
  if (trimmed.length < 16) throw new Error("credentials key must be 32 bytes of base64, or a passphrase of 16 characters or more");
  const hit = derived.get(trimmed);
  if (hit) return hit;
  const key = scryptSync(trimmed, PASSPHRASE_SALT, 32);
  derived.set(trimmed, key);
  return key;
}

function key(): Buffer {
  return loadKey("CREDENTIALS_ENCRYPTION_KEY", true);
}

function previousKey(): Buffer | null {
  return loadKey("CREDENTIALS_ENCRYPTION_KEY_PREVIOUS", false);
}

export function encryptJson(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decryptWith(payload: string, decryptionKey: Buffer): Buffer {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", decryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function decryptJson<T = unknown>(payload: string): T {
  try {
    return JSON.parse(decryptWith(payload, key()).toString("utf8")) as T;
  } catch (err) {
    const fallback = previousKey();
    if (!fallback) throw err;
    return JSON.parse(decryptWith(payload, fallback).toString("utf8")) as T;
  }
}
