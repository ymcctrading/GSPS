/**
 * /api/alpaca/connect-live: a server without its encryption key answers 503
 * with a readable message and saves nothing (it used to throw, which sent an
 * empty body the Settings page could only show as a JSON parse error).
 */

import { describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn(async () => ({ error: null })));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ upsert }),
  }),
}));
vi.mock("@/lib/brokers/alpaca", () => ({ getAccount: async () => ({ equity: "30" }) }));

import { POST } from "@/app/api/alpaca/connect-live/route";

const req = () =>
  new Request("http://x/api/alpaca/connect-live", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: "k", apiSecret: "s" }),
  }) as unknown as Parameters<typeof POST>[0];

describe("POST /api/alpaca/connect-live", () => {
  it("answers 503 in JSON and saves nothing when the encryption key is missing", async () => {
    const prev = process.env.CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("encryption_unavailable");
    expect(upsert).not.toHaveBeenCalled();
    spy.mockRestore();
    if (prev !== undefined) process.env.CREDENTIALS_ENCRYPTION_KEY = prev;
  });

  it("saves the encrypted keys when the encryption key is set", async () => {
    const prev = process.env.CREDENTIALS_ENCRYPTION_KEY;
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    const row = (upsert.mock.calls[0] as unknown as [{ credentials: { enc: string } }])[0];
    expect(row.credentials.enc).not.toMatch(/"k"|"s"/);
    if (prev === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = prev;
  });
});
