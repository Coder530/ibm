import type { GeocodeResponse } from "@/types/api";

/** A failure that didn't come from the server as a typed GeocodeResponse —
 *  the fetch itself rejected, the response wasn't OK and wasn't JSON, or the
 *  body failed to parse. Callers only ever need `.ok` and `.message`. */
export interface PostGeocodeNetworkFailure {
  ok: false;
  message: string;
}

export type PostGeocodeResult = GeocodeResponse | PostGeocodeNetworkFailure;

const GENERIC_ERROR_MESSAGE = "Couldn't check that right now. Try again.";

function isGeocodeResponse(value: unknown): value is GeocodeResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== "boolean") return false;
  if (record.ok === false) return typeof record.message === "string";
  return (
    typeof record.area === "string" &&
    (record.postcode === null || typeof record.postcode === "string") &&
    typeof record.latitude === "number" &&
    typeof record.longitude === "number"
  );
}

/**
 * POSTs to `/api/geocode` and always resolves to a typed result — never
 * throws. Covers three failure shapes that a raw `fetch` + `.json()` call
 * doesn't: the network request itself rejecting (offline, DNS, CORS), a
 * non-OK response whose body isn't JSON (e.g. a 500 HTML error page), and a
 * response whose body fails to parse as JSON at all. A non-OK response that
 * IS a typed GeocodeResponse (the 429 rate_limited case, 413, etc.) is
 * passed through as-is so its `message` reaches the caller.
 */
export async function postGeocode(
  body: { postcode: string } | { latitude: number; longitude: number },
  fetchImpl: typeof fetch = fetch
): Promise<PostGeocodeResult> {
  let response: Response;
  try {
    response = await fetchImpl("/api/geocode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  if (!isGeocodeResponse(data)) {
    return { ok: false, message: GENERIC_ERROR_MESSAGE };
  }

  return data;
}
