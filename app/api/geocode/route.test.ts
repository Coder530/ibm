import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/geocode", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/geocode", () => {
  it("returns 400 bad_request for a malformed body", async () => {
    const response = await POST(postRequest({ foo: "bar" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ ok: false, code: "bad_request", message: expect.any(String) });
  });

  it("returns 400 invalid_postcode for an invalid postcode", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(postRequest({ postcode: "12345" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      code: "invalid_postcode",
      message: expect.any(String),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when postcodes.io returns 404", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { status: 404 }));
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(postRequest({ postcode: "SW1A 1AA" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ ok: false, code: "not_found", message: expect.any(String) });
  });

  it("returns 200 with area for a valid postcode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        status: 200,
        result: {
          postcode: "SW1A 1AA",
          latitude: 51.501009,
          longitude: -0.141588,
          admin_district: "Westminster",
          region: "London",
        },
      })
    );
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(postRequest({ postcode: "SW1A 1AA" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      area: "Westminster",
      postcode: "SW1A 1AA",
      latitude: 51.501009,
      longitude: -0.141588,
    });
  });

  it("returns 502 upstream_error when the upstream service fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(postRequest({ postcode: "SW1A 1AA" }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      code: "upstream_error",
      message: expect.any(String),
    });
  });

  it("S4: rate-limits — a 21st rapid request from the same IP gets 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { status: 404 }));
    vi.stubGlobal("fetch", fetchImpl);
    const ip = "203.0.113.77";

    let lastStatus = 200;
    for (let i = 0; i < 21; i++) {
      const response = await POST(postRequest({ postcode: "SW1A 1AA" }, { "x-vercel-forwarded-for": ip }));
      lastStatus = response.status;
    }

    expect(lastStatus).toBe(429);
    const response = await POST(postRequest({ postcode: "SW1A 1AA" }, { "x-vercel-forwarded-for": ip }));
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      code: "rate_limited",
      message: "Too many requests. Please slow down.",
    });
  });

  it("S5: returns 413 for an oversized body", async () => {
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(
      postRequest(
        { postcode: "SW1A 1AA", padding: "x".repeat(3000) },
        { "x-vercel-forwarded-for": "203.0.113.78" }
      )
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body).toEqual({ ok: false, code: "bad_request", message: expect.any(String) });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
