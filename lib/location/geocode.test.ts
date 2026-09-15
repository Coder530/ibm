import { describe, expect, it, vi } from "vitest";
import { geocodePostcode, reverseGeocode } from "./geocode";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("geocodePostcode", () => {
  it("returns invalid_postcode without calling fetch for bad input", async () => {
    const fetchImpl = vi.fn();
    const result = await geocodePostcode("not a postcode", fetchImpl);
    expect(result).toEqual({
      ok: false,
      code: "invalid_postcode",
      message: expect.any(String),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves area and coordinates on success", async () => {
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

    const result = await geocodePostcode("sw1a 1aa", fetchImpl);
    expect(result).toEqual({
      ok: true,
      area: "Westminster",
      postcode: "SW1A 1AA",
      latitude: 51.501009,
      longitude: -0.141588,
    });
  });

  it("returns not_found for a 404 upstream response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(404, { status: 404, error: "Postcode not found" }));

    const result = await geocodePostcode("SW1A 1AA", fetchImpl);
    expect(result).toEqual({ ok: false, code: "not_found", message: expect.any(String) });
  });

  it("returns upstream_error when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await geocodePostcode("SW1A 1AA", fetchImpl);
    expect(result).toEqual({
      ok: false,
      code: "upstream_error",
      message: expect.any(String),
    });
  });

  it("A6/S6: times out a never-resolving fetch and never leaks the thrown error text into the client message", async () => {
    const thrownText = "SECRET_UPSTREAM_DETAIL_THAT_MUST_NOT_LEAK";
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((_resolve, reject) => {
          // Ignores the AbortSignal entirely (simulating a fetch impl that
          // doesn't honour cancellation) and settles well after our 20ms
          // timeout, so this only passes if geocodePostcode races an
          // independent timer rather than relying on the fetch call itself
          // to reject promptly.
          setTimeout(() => reject(new Error(thrownText)), 200);
        })
    );

    const result = await geocodePostcode("SW1A 1AA", fetchImpl, 20);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "upstream_error" });
    if (!result.ok) {
      expect(result.message).not.toContain(thrownText);
    }
  });
});

describe("reverseGeocode", () => {
  it("resolves area from nearest postcode", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        status: 200,
        result: [
          {
            postcode: "SW1A 1AA",
            latitude: 51.501009,
            longitude: -0.141588,
            admin_district: "Westminster",
            region: "London",
          },
        ],
      })
    );

    const result = await reverseGeocode(51.501009, -0.141588, fetchImpl);
    expect(result).toEqual({
      ok: true,
      area: "Westminster",
      postcode: "SW1A 1AA",
      latitude: 51.501009,
      longitude: -0.141588,
    });
  });

  it('returns ok:true with area "Near you" when no result is found', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { status: 200, result: null }));

    const result = await reverseGeocode(0, 0, fetchImpl);
    expect(result).toEqual({
      ok: true,
      area: "Near you",
      postcode: null,
      latitude: 0,
      longitude: 0,
    });
  });

  it("returns upstream_error on non-ok response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { status: 500, error: "boom" }));

    const result = await reverseGeocode(51.5, -0.1, fetchImpl);
    expect(result).toEqual({
      ok: false,
      code: "upstream_error",
      message: expect.any(String),
    });
  });
});
