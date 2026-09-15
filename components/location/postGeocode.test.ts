import { describe, expect, it } from "vitest";
import { postGeocode } from "./postGeocode";

describe("postGeocode", () => {
  it("resolves to a typed failure instead of throwing when fetch rejects", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const result = await postGeocode({ postcode: "SW1A 1AA" }, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("resolves to a typed failure for a non-OK text/html response instead of throwing on .json()", async () => {
    const fetchImpl = (async () =>
      new Response("<html><body>Internal Server Error</body></html>", {
        status: 500,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;

    const result = await postGeocode({ postcode: "SW1A 1AA" }, fetchImpl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.message).toBe("string");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("resolves to the typed GeocodeResponse for a normal ok:true JSON response", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ ok: true, area: "Westminster", postcode: "SW1A 1AA", latitude: 51.5, longitude: -0.12 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as unknown as typeof fetch;

    const result = await postGeocode({ postcode: "SW1A 1AA" }, fetchImpl);

    expect(result).toEqual({
      ok: true,
      area: "Westminster",
      postcode: "SW1A 1AA",
      latitude: 51.5,
      longitude: -0.12,
    });
  });

  it("surfaces the server's message for a non-OK response that IS valid JSON (e.g. 429 rate_limited)", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ ok: false, code: "rate_limited", message: "Too many requests. Please slow down." }), {
        status: 429,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    const result = await postGeocode({ postcode: "SW1A 1AA" }, fetchImpl);

    expect(result).toEqual({ ok: false, code: "rate_limited", message: "Too many requests. Please slow down." });
  });
});
