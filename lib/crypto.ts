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

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function loadKey(envVar: string, required: true): Buffer;
function loadKey(envVar: string, required: false): Buffer | null;
function loadKey(envVar: string, required: boolean): Buffer | null {
  const raw = process.env[envVar];
  if (!raw) {
    if (required) throw new Error(`${envVar} is not configured`);
    return null;
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${envVar} must be 32 bytes (base64)`);
  return buf;
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
