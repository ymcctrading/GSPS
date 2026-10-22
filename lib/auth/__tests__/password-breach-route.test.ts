/** Review finding S-11 follow-up: the breach-lookup relay route. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/auth/password-breach/route";

const call = (prefix: string) =>
  GET(new NextRequest(`http://localhost/api/auth/password-breach?prefix=${prefix}`));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/auth/password-breach", () => {
  it("refuses anything but five hex characters, without calling out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const bad of ["", "5BAA", "5BAA61", "ZZZZZ", "5baa%2F"]) {
      expect((await call(bad)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("relays the padded range for the upper-cased prefix", async () => {
    const fetchMock = vi.fn(async () => new Response("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3\r\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call("5baa6");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect((init.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("answers 502 when the service fails or cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    expect((await call("5BAA6")).status).toBe(502);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect((await call("5BAA6")).status).toBe(502);
  });
});
