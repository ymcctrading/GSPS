import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

const ENV_KEYS = ["CREDENTIALS_ENCRYPTION_KEY", "CREDENTIALS_ENCRYPTION_KEY_PREVIOUS"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function freshKey(): string {
  return randomBytes(32).toString("base64");
}

async function loadCrypto() {
  // lib/crypto.ts reads env vars lazily inside each call, so a fresh import
  // per test isn't required — but resetModules keeps each test's env
  // mutations from leaking into another via any module-level caching.
  const mod = await import("../crypto");
  return mod;
}

describe("encryptJson / decryptJson", () => {
  it("round-trips under the current key", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = freshKey();
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    const { encryptJson, decryptJson } = await loadCrypto();

    const payload = encryptJson({ userSecret: "abc123" });
    expect(decryptJson<{ userSecret: string }>(payload).userSecret).toBe("abc123");
  });

  it("falls back to the previous key when the current key can't decrypt it", async () => {
    const oldKey = freshKey();
    process.env.CREDENTIALS_ENCRYPTION_KEY = oldKey;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    const { encryptJson, decryptJson } = await loadCrypto();

    const payload = encryptJson({ apiKey: "old-secret" });

    // Rotate: new current key, old one demoted to "previous".
    process.env.CREDENTIALS_ENCRYPTION_KEY = freshKey();
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = oldKey;

    expect(decryptJson<{ apiKey: string }>(payload).apiKey).toBe("old-secret");
  });

  it("throws when neither key decrypts the payload", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = freshKey();
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    const { encryptJson } = await loadCrypto();
    const payload = encryptJson({ apiKey: "secret" });

    process.env.CREDENTIALS_ENCRYPTION_KEY = freshKey();
    process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS = freshKey();
    const { decryptJson } = await loadCrypto();

    expect(() => decryptJson(payload)).toThrow();
  });
});

describe("keyFromSecret", () => {
  it("uses 32 bytes of base64 as the key itself", async () => {
    const { keyFromSecret } = await loadCrypto();
    const raw = randomBytes(32);
    expect(keyFromSecret(raw.toString("base64")).equals(raw)).toBe(true);
    expect(keyFromSecret(`${raw.toString("base64")}\n`).equals(raw)).toBe(true);
  });

  it("stretches any other secret of 16+ characters into the same 32-byte key every time", async () => {
    const { keyFromSecret } = await loadCrypto();
    const a = keyFromSecret("my own passphrase 2026");
    expect(a.length).toBe(32);
    expect(keyFromSecret("my own passphrase 2026").equals(a)).toBe(true);
    expect(keyFromSecret("another passphrase 2026").equals(a)).toBe(false);
  });

  it("refuses a short secret", async () => {
    const { keyFromSecret } = await loadCrypto();
    expect(() => keyFromSecret("short")).toThrow(/16 characters/);
  });

  it("round-trips under a passphrase-style key", async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "a passphrase, not base64 at all";
    delete process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS;
    const { encryptJson, decryptJson } = await loadCrypto();
    expect(decryptJson(encryptJson({ key: "k", secret: "s" }))).toEqual({ key: "k", secret: "s" });
  });
});
